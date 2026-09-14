const crypto = require('crypto');

/**
 * Computes SHA-256 hash of a string or buffer
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Combines two hashes and computes their parent hash
 */
function hashPair(a, b) {
  return sha256(a + b);
}

/**
 * Builds a Merkle Tree from an array of leaf hashes
 * @param {string[]} leaves Array of hex hash strings
 * @returns {object} { root, leaves, leafCount, treeHeight, layers }
 */
function buildMerkleTree(leaves = []) {
  if (!leaves || leaves.length === 0) {
    const genesisRoot = sha256('JISEMS-GENESIS-BLOCK');
    return {
      root: genesisRoot,
      leaves: [],
      leafCount: 0,
      treeHeight: 0,
      layers: [[genesisRoot]],
    };
  }

  // Normalize all leaves
  let currentLayer = leaves.map(l => (typeof l === 'string' ? l : String(l)));
  const layers = [currentLayer];

  while (currentLayer.length > 1) {
    const nextLayer = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      // If odd number of nodes, duplicate the last node
      const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
      nextLayer.push(hashPair(left, right));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return {
    root: currentLayer[0],
    leaves,
    leafCount: leaves.length,
    treeHeight: layers.length - 1,
    layers,
  };
}

/**
 * Generates an audit proof for a specific leaf index
 * @param {string[][]} layers
 * @param {number} index
 * @returns {Array<{position: 'left'|'right', hash: string}>}
 */
function getMerkleProof(layers, index) {
  const proof = [];
  let currentIndex = index;

  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    const isRightNode = currentIndex % 2 === 1;
    const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

    if (siblingIndex < layer.length) {
      proof.push({
        position: isRightNode ? 'left' : 'right',
        hash: layer[siblingIndex],
      });
    } else {
      // Duplicated last node
      proof.push({
        position: 'right',
        hash: layer[currentIndex],
      });
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Verifies a Merkle proof against a root
 */
function verifyMerkleProof(leaf, proof, expectedRoot) {
  let hash = leaf;
  for (const step of proof) {
    if (step.position === 'left') {
      hash = hashPair(step.hash, hash);
    } else {
      hash = hashPair(hash, step.hash);
    }
  }
  return hash === expectedRoot;
}

module.exports = {
  sha256,
  hashPair,
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
};
