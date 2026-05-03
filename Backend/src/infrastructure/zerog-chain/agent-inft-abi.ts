// Hand-written minimal ABI for AgentINFT — only the entries we call/read.
// Keep in sync with contracts/contracts/AgentINFT.sol.
export const AGENT_INFT_ABI = [
  {
    type: "function",
    name: "mintAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "rmkSealId", type: "bytes32" }
    ],
    outputs: [{ name: "tokenId", type: "uint256" }]
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "parent", type: "bytes32" },
      { name: "manifestUri", type: "bytes32" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "message", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "forkAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentTokenId", type: "uint256" },
      { name: "atCommit", type: "bytes32" },
      { name: "newRmkSealId", type: "bytes32" },
      { name: "to", type: "address" }
    ],
    outputs: [{ name: "childTokenId", type: "uint256" }]
  },
  {
    type: "function",
    name: "attestReseal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "newSealId", type: "bytes32" },
      { name: "oracleSig", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "getHead",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "repositories",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "head", type: "bytes32" },
      { name: "rmkSealId", type: "bytes32" },
      { name: "createdAt", type: "uint64" },
      { name: "parentTokenId", type: "uint256" },
      { name: "parentCommit", type: "bytes32" }
    ]
  },
  {
    type: "function",
    name: "getCommit",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "commitHash", type: "bytes32" }
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "parent", type: "bytes32" },
          { name: "manifestUri", type: "bytes32" },
          { name: "merkleRoot", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "timestamp", type: "uint64" },
          { name: "message", type: "string" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getLineage",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }]
  },
  {
    type: "function",
    name: "totalMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "event",
    name: "AgentMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "rmkSealId", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "event",
    name: "CommitAdded",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "commitHash", type: "bytes32", indexed: true },
      { name: "parent", type: "bytes32", indexed: false },
      { name: "manifestUri", type: "bytes32", indexed: false },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "message", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "AgentForked",
    inputs: [
      { name: "parentTokenId", type: "uint256", indexed: true },
      { name: "childTokenId", type: "uint256", indexed: true },
      { name: "atCommit", type: "bytes32", indexed: false },
      { name: "newOwner", type: "address", indexed: false }
    ]
  }
] as const;
