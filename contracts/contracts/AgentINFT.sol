// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title AgentINFT — Sirius for Agents (ERC-721 + ERC-7857-style + EIP-2981)
/// @notice Each iNFT represents an AI agent with versioned, encrypted memory.
/// @dev Storage layout follows PROJECT_SPEC §4.2. Anti-fork is enforced inside `commit`.
contract AgentINFT is ERC721, IERC2981 {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct Repository {
        bytes32 head;            // latest commit hash (0x0 = genesis, no commits yet)
        bytes32 rmkSealId;       // pointer to sealed Root Master Key on 0G Storage
        uint64  createdAt;       // block timestamp at mint
        uint256 parentTokenId;   // 0 if not a fork
        bytes32 parentCommit;    // 0x0 if not a fork, else commit at which fork happened
    }

    struct Commit {
        bytes32 parent;          // previous commit hash (0x0 for genesis)
        bytes32 manifestUri;     // 0G Storage blob ID for the manifest JSON
        bytes32 merkleRoot;      // SHA-256 of canonicalized manifest
        address author;
        uint64  timestamp;
        string  message;
    }

    /// tokenId => Repository
    mapping(uint256 => Repository) public repositories;
    /// tokenId => commitHash => Commit
    mapping(uint256 => mapping(bytes32 => Commit)) public commits;

    /// @dev tokenId => royalty receiver (defaults to current owner if zero)
    mapping(uint256 => address) public royaltyReceivers;
    /// @dev royalty in basis points (10000 = 100%)
    uint96 public constant ROYALTY_BPS = 500; // 5% on transfer / inference usage

    /// @notice TEE oracle pubkey hash (EOA address derived from oracle pubkey).
    /// @dev Hardcoded at deploy for hackathon demo. Spec §15 explicitly allows mock.
    address public immutable oracleAddress;

    uint256 private _nextTokenId = 1;

    event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 rmkSealId);
    event CommitAdded(
        uint256 indexed tokenId,
        bytes32 indexed commitHash,
        bytes32 parent,
        bytes32 manifestUri,
        bytes32 merkleRoot,
        string  message
    );
    event AgentForked(
        uint256 indexed parentTokenId,
        uint256 indexed childTokenId,
        bytes32 atCommit,
        address newOwner
    );
    event MetadataResealed(uint256 indexed tokenId, address indexed newOwner, bytes32 newSealId);

    error NotTokenOwner();
    error AntiForkViolation(bytes32 expectedParent, bytes32 gotParent);
    error CommitAlreadyExists(bytes32 commitHash);
    error CommitNotFound(bytes32 commitHash);
    error TokenNotFound(uint256 tokenId);
    error InvalidOracleSignature();

    constructor(address _oracle) ERC721("Sirius Agent iNFT", "SIRIUS") {
        oracleAddress = _oracle;
    }

    /// @notice Mint a fresh agent.
    /// @param to The owner of the new iNFT.
    /// @param rmkSealId Blob ID of the sealed Root Master Key already uploaded to 0G Storage.
    /// @return tokenId The newly minted token ID.
    function mintAgent(address to, bytes32 rmkSealId) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        repositories[tokenId] = Repository({
            head: bytes32(0),
            rmkSealId: rmkSealId,
            createdAt: uint64(block.timestamp),
            parentTokenId: 0,
            parentCommit: bytes32(0)
        });
        royaltyReceivers[tokenId] = to;
        _safeMint(to, tokenId);
        emit AgentMinted(tokenId, to, rmkSealId);
    }

    /// @notice Append a commit to the agent's commit chain.
    /// @dev Anti-fork: `parent` must equal current `repositories[tokenId].head`.
    function commit(
        uint256 tokenId,
        bytes32 commitHash,
        bytes32 parent,
        bytes32 manifestUri,
        bytes32 merkleRoot,
        string calldata message
    ) external {
        if (_ownerOf(tokenId) == address(0)) revert TokenNotFound(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        Repository storage repo = repositories[tokenId];
        if (parent != repo.head) revert AntiForkViolation(repo.head, parent);

        Commit storage existing = commits[tokenId][commitHash];
        if (existing.timestamp != 0) revert CommitAlreadyExists(commitHash);

        commits[tokenId][commitHash] = Commit({
            parent: parent,
            manifestUri: manifestUri,
            merkleRoot: merkleRoot,
            author: msg.sender,
            timestamp: uint64(block.timestamp),
            message: message
        });

        // gas: one SSTORE for head + commit struct fields above
        repo.head = commitHash;

        emit CommitAdded(tokenId, commitHash, parent, manifestUri, merkleRoot, message);
    }

    /// @notice Fork an agent at a specific commit, minting a new iNFT for the new owner.
    /// @param parentTokenId Token to fork from.
    /// @param atCommit Commit hash where the fork happens. Must exist on parent.
    /// @param newRmkSealId Sealed RMK blob for the new owner.
    /// @param to Recipient of the child iNFT.
    function forkAgent(
        uint256 parentTokenId,
        bytes32 atCommit,
        bytes32 newRmkSealId,
        address to
    ) external returns (uint256 childTokenId) {
        if (_ownerOf(parentTokenId) == address(0)) revert TokenNotFound(parentTokenId);
        // Genesis fork (atCommit == 0x0) is allowed: child starts fresh-but-attributed.
        if (atCommit != bytes32(0)) {
            Commit storage c = commits[parentTokenId][atCommit];
            if (c.timestamp == 0) revert CommitNotFound(atCommit);
        }

        childTokenId = _nextTokenId++;
        repositories[childTokenId] = Repository({
            head: atCommit, // child starts with HEAD pointed at fork point
            rmkSealId: newRmkSealId,
            createdAt: uint64(block.timestamp),
            parentTokenId: parentTokenId,
            parentCommit: atCommit
        });
        royaltyReceivers[childTokenId] = to;
        _safeMint(to, childTokenId);

        emit AgentForked(parentTokenId, childTokenId, atCommit, to);
    }

    /// @notice ERC-7857 secure-transfer hook.
    /// @dev On NFT transfer, the TEE oracle re-encrypts the RMK for the new owner and posts the new seal id with a signature.
    /// @param tokenId The token whose metadata was resealed.
    /// @param newSealId New sealed-RMK blob id.
    /// @param oracleSig EIP-191 signature by oracleAddress over (chainId, address(this), tokenId, newOwner, newSealId).
    function attestReseal(uint256 tokenId, bytes32 newSealId, bytes calldata oracleSig) external {
        if (_ownerOf(tokenId) == address(0)) revert TokenNotFound(tokenId);
        address newOwner = ownerOf(tokenId);

        bytes32 digest = keccak256(
            abi.encodePacked(block.chainid, address(this), tokenId, newOwner, newSealId)
        ).toEthSignedMessageHash();

        address signer = digest.recover(oracleSig);
        if (signer != oracleAddress) revert InvalidOracleSignature();

        repositories[tokenId].rmkSealId = newSealId;
        emit MetadataResealed(tokenId, newOwner, newSealId);
    }

    // ============ Views ============

    function getHead(uint256 tokenId) external view returns (bytes32) {
        if (_ownerOf(tokenId) == address(0)) revert TokenNotFound(tokenId);
        return repositories[tokenId].head;
    }

    function getCommit(uint256 tokenId, bytes32 commitHash) external view returns (Commit memory) {
        Commit memory c = commits[tokenId][commitHash];
        if (c.timestamp == 0) revert CommitNotFound(commitHash);
        return c;
    }

    /// @notice Walk parentTokenId chain. Capped at 32 levels to bound gas.
    function getLineage(uint256 tokenId) external view returns (uint256[] memory ancestors) {
        uint256[] memory tmp = new uint256[](32);
        uint256 count = 0;
        uint256 cursor = tokenId;
        while (count < 32) {
            uint256 parent = repositories[cursor].parentTokenId;
            if (parent == 0) break;
            tmp[count++] = parent;
            cursor = parent;
        }
        ancestors = new uint256[](count);
        for (uint256 i = 0; i < count; i++) ancestors[i] = tmp[i];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ============ EIP-2981 ============

    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = royaltyReceivers[tokenId];
        if (receiver == address(0)) receiver = _ownerOf(tokenId);
        royaltyAmount = (salePrice * ROYALTY_BPS) / 10_000;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
