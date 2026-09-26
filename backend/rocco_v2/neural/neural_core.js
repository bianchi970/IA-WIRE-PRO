"use strict";

// ============================================================================
// NEURAL CORE — Motore neurale puro JavaScript per ROCCO
// MLP con backpropagation, zero dipendenze esterne
// ============================================================================

// --- Funzioni di attivazione ---

function sigmoid(x) {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

function sigmoidPrime(y) {
  // y = sigmoid(x) già calcolato
  return y * (1 - y);
}

function tanhAct(x) {
  return Math.tanh(x);
}

function tanhPrime(y) {
  return 1 - y * y;
}

function relu(x) {
  return x > 0 ? x : 0;
}

function reluPrime(y) {
  return y > 0 ? 1 : 0;
}

function leakyRelu(x, alpha) {
  alpha = alpha || 0.01;
  return x > 0 ? x : alpha * x;
}

function leakyReluPrime(y, alpha) {
  alpha = alpha || 0.01;
  return y > 0 ? 1 : alpha;
}

function softmax(arr) {
  var max = -Infinity;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  var exps = new Array(arr.length);
  var sum = 0;
  for (var i = 0; i < arr.length; i++) {
    exps[i] = Math.exp(arr[i] - max);
    sum += exps[i];
  }
  for (var i = 0; i < arr.length; i++) {
    exps[i] /= sum;
  }
  return exps;
}

function getActivation(name) {
  switch (name) {
    case "sigmoid": return { fn: sigmoid, prime: sigmoidPrime };
    case "tanh": return { fn: tanhAct, prime: tanhPrime };
    case "relu": return { fn: relu, prime: reluPrime };
    case "leaky_relu": return { fn: leakyRelu, prime: leakyReluPrime };
    case "linear": return { fn: function(x) { return x; }, prime: function() { return 1; } };
    default: return { fn: sigmoid, prime: sigmoidPrime };
  }
}

// --- Loss functions ---

function mseLoss(predicted, target) {
  var sum = 0;
  for (var i = 0; i < predicted.length; i++) {
    var d = predicted[i] - target[i];
    sum += d * d;
  }
  return sum / predicted.length;
}

function mseGradient(predicted, target) {
  var grad = new Array(predicted.length);
  var n = predicted.length;
  for (var i = 0; i < n; i++) {
    grad[i] = 2 * (predicted[i] - target[i]) / n;
  }
  return grad;
}

function crossEntropyLoss(predicted, target) {
  var sum = 0;
  var eps = 1e-12;
  for (var i = 0; i < predicted.length; i++) {
    var p = Math.max(eps, Math.min(1 - eps, predicted[i]));
    sum -= target[i] * Math.log(p);
  }
  return sum;
}

function crossEntropyGradient(predicted, target) {
  // Per softmax output: gradient semplificato = predicted - target
  var grad = new Array(predicted.length);
  for (var i = 0; i < predicted.length; i++) {
    grad[i] = predicted[i] - target[i];
  }
  return grad;
}

function binaryCrossEntropyLoss(predicted, target) {
  var sum = 0;
  var eps = 1e-12;
  for (var i = 0; i < predicted.length; i++) {
    var p = Math.max(eps, Math.min(1 - eps, predicted[i]));
    sum -= target[i] * Math.log(p) + (1 - target[i]) * Math.log(1 - p);
  }
  return sum / predicted.length;
}

// --- Utilità matematiche ---

function vecNorm(v) {
  var sum = 0;
  for (var i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function clipGradients(grads, maxNorm) {
  var norm = vecNorm(grads);
  if (norm > maxNorm) {
    var scale = maxNorm / norm;
    for (var i = 0; i < grads.length; i++) grads[i] *= scale;
  }
  return grads;
}

function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ============================================================================
// Classe Layer
// ============================================================================

function Layer(inputSize, outputSize, activationName) {
  this.inputSize = inputSize;
  this.outputSize = outputSize;
  this.activationName = activationName || "sigmoid";
  this.activation = getActivation(this.activationName);

  // Pesi e bias
  this.weights = [];
  this.biases = new Array(outputSize);

  // Velocità (per momentum)
  this.vWeights = [];
  this.vBiases = new Array(outputSize);

  // Cache per backprop
  this.lastInput = null;
  this.lastOutput = null;
  this.lastPreActivation = null;

  // Inizializzazione Xavier
  var scale = Math.sqrt(2.0 / (inputSize + outputSize));
  for (var i = 0; i < outputSize; i++) {
    this.weights[i] = new Array(inputSize);
    this.vWeights[i] = new Array(inputSize);
    for (var j = 0; j < inputSize; j++) {
      this.weights[i][j] = (Math.random() * 2 - 1) * scale;
      this.vWeights[i][j] = 0;
    }
    this.biases[i] = 0;
    this.vBiases[i] = 0;
  }
}

Layer.prototype.forward = function(input) {
  this.lastInput = input;
  var pre = new Array(this.outputSize);
  var out = new Array(this.outputSize);

  for (var i = 0; i < this.outputSize; i++) {
    var sum = this.biases[i];
    for (var j = 0; j < this.inputSize; j++) {
      sum += this.weights[i][j] * input[j];
    }
    pre[i] = sum;
  }

  this.lastPreActivation = pre;

  if (this.activationName === "softmax") {
    out = softmax(pre);
  } else {
    for (var i = 0; i < this.outputSize; i++) {
      out[i] = this.activation.fn(pre[i]);
    }
  }

  this.lastOutput = out;
  return out;
};

Layer.prototype.backward = function(gradient, learningRate, momentum, weightDecay, maxGradNorm) {
  var inputGrad = new Array(this.inputSize);
  for (var j = 0; j < this.inputSize; j++) inputGrad[j] = 0;

  for (var i = 0; i < this.outputSize; i++) {
    var delta;
    if (this.activationName === "softmax") {
      // Per softmax+cross-entropy, il gradient è già corretto (pred - target)
      delta = gradient[i];
    } else {
      delta = gradient[i] * this.activation.prime(this.lastOutput[i]);
    }

    // Gradient clipping per neurone
    if (Math.abs(delta) > (maxGradNorm || 5)) {
      delta = delta > 0 ? (maxGradNorm || 5) : -(maxGradNorm || 5);
    }

    for (var j = 0; j < this.inputSize; j++) {
      inputGrad[j] += this.weights[i][j] * delta;

      // Weight decay
      var wd = weightDecay ? weightDecay * this.weights[i][j] : 0;

      // Momentum update
      this.vWeights[i][j] = (momentum || 0) * this.vWeights[i][j] - learningRate * (delta * this.lastInput[j] + wd);
      this.weights[i][j] += this.vWeights[i][j];
    }

    this.vBiases[i] = (momentum || 0) * this.vBiases[i] - learningRate * delta;
    this.biases[i] += this.vBiases[i];
  }

  return inputGrad;
};

Layer.prototype.toJSON = function() {
  return {
    inputSize: this.inputSize,
    outputSize: this.outputSize,
    activationName: this.activationName,
    weights: this.weights,
    biases: this.biases
  };
};

Layer.prototype.fromJSON = function(data) {
  this.weights = data.weights;
  this.biases = data.biases;
  // Reset velocità
  for (var i = 0; i < this.outputSize; i++) {
    this.vWeights[i] = new Array(this.inputSize);
    for (var j = 0; j < this.inputSize; j++) this.vWeights[i][j] = 0;
    this.vBiases[i] = 0;
  }
};

// ============================================================================
// Classe Network
// ============================================================================

function Network(config) {
  this.config = Object.assign({
    learningRate: 0.01,
    momentum: 0.9,
    weightDecay: 0.0001,
    maxGradNorm: 5,
    lossFunction: "mse"  // "mse" | "cross_entropy" | "binary_cross_entropy"
  }, config || {});

  this.layers = [];
  this.epoch = 0;
  this.bestLoss = Infinity;
  this.metadata = {};

  if (config && config.layers) {
    for (var i = 0; i < config.layers.length; i++) {
      var l = config.layers[i];
      this.layers.push(new Layer(l.input, l.output, l.activation));
    }
  }
}

Network.prototype.forward = function(input) {
  var x = input;
  for (var i = 0; i < this.layers.length; i++) {
    x = this.layers[i].forward(x);
  }
  return x;
};

Network.prototype.predict = function(input) {
  return this.forward(input);
};

Network.prototype.backward = function(target) {
  var output = this.layers[this.layers.length - 1].lastOutput;
  var loss, gradient;

  switch (this.config.lossFunction) {
    case "cross_entropy":
      loss = crossEntropyLoss(output, target);
      gradient = crossEntropyGradient(output, target);
      break;
    case "binary_cross_entropy":
      loss = binaryCrossEntropyLoss(output, target);
      gradient = mseGradient(output, target); // simplified
      break;
    default:
      loss = mseLoss(output, target);
      gradient = mseGradient(output, target);
  }

  // Backprop attraverso tutti i layer (dal fondo)
  for (var i = this.layers.length - 1; i >= 0; i--) {
    gradient = this.layers[i].backward(
      gradient,
      this.config.learningRate,
      this.config.momentum,
      this.config.weightDecay,
      this.config.maxGradNorm
    );
  }

  return loss;
};

Network.prototype.trainStep = function(input, target) {
  this.forward(input);
  return this.backward(target);
};

Network.prototype.train = function(inputs, targets, options) {
  options = Object.assign({
    epochs: 100,
    batchSize: 0,  // 0 = full batch
    shuffle: true,
    earlyStopPatience: 0,  // 0 = disabled
    verbose: false,
    lrSchedule: null  // "step_decay" | "exponential" | "cosine"
  }, options || {});

  var baseLR = this.config.learningRate;
  var noImprove = 0;
  var history = [];

  for (var e = 0; e < options.epochs; e++) {
    this.epoch++;

    // Learning rate schedule
    if (options.lrSchedule) {
      this.config.learningRate = scheduleLR(baseLR, e, options.epochs, options.lrSchedule);
    }

    // Shuffle
    var indices = [];
    for (var i = 0; i < inputs.length; i++) indices.push(i);
    if (options.shuffle) shuffleArray(indices);

    var epochLoss = 0;
    var batchSize = options.batchSize || inputs.length;

    for (var b = 0; b < indices.length; b += batchSize) {
      var end = Math.min(b + batchSize, indices.length);
      var batchLoss = 0;

      for (var k = b; k < end; k++) {
        var idx = indices[k];
        batchLoss += this.trainStep(inputs[idx], targets[idx]);
      }

      epochLoss += batchLoss;
    }

    epochLoss /= inputs.length;
    history.push(epochLoss);

    if (epochLoss < this.bestLoss) {
      this.bestLoss = epochLoss;
      noImprove = 0;
    } else {
      noImprove++;
    }

    if (options.earlyStopPatience > 0 && noImprove >= options.earlyStopPatience) {
      break;
    }
  }

  // Ripristina LR
  this.config.learningRate = baseLR;

  return { loss: history[history.length - 1], epochs: history.length, history: history };
};

Network.prototype.save = function() {
  var layerData = [];
  for (var i = 0; i < this.layers.length; i++) {
    layerData.push(this.layers[i].toJSON());
  }
  return {
    config: this.config,
    layers: layerData,
    epoch: this.epoch,
    bestLoss: this.bestLoss,
    metadata: this.metadata,
    savedAt: new Date().toISOString()
  };
};

Network.prototype.load = function(data) {
  this.config = data.config;
  this.epoch = data.epoch || 0;
  this.bestLoss = data.bestLoss || Infinity;
  this.metadata = data.metadata || {};

  this.layers = [];
  for (var i = 0; i < data.layers.length; i++) {
    var ld = data.layers[i];
    var layer = new Layer(ld.inputSize, ld.outputSize, ld.activationName);
    layer.fromJSON(ld);
    this.layers.push(layer);
  }
};

Network.prototype.clone = function() {
  var net = new Network();
  net.load(this.save());
  return net;
};

// --- Learning Rate Schedule ---

function scheduleLR(baseLR, epoch, totalEpochs, strategy) {
  switch (strategy) {
    case "step_decay":
      // Dimezza ogni 1/3 delle epoche
      var step = Math.floor(totalEpochs / 3);
      return baseLR * Math.pow(0.5, Math.floor(epoch / Math.max(1, step)));
    case "exponential":
      return baseLR * Math.pow(0.95, epoch);
    case "cosine":
      return baseLR * 0.5 * (1 + Math.cos(Math.PI * epoch / totalEpochs));
    default:
      return baseLR;
  }
}

// --- Factory ---

function createNetwork(layerSizes, activation, lossFunction) {
  activation = activation || "sigmoid";
  var layers = [];
  for (var i = 0; i < layerSizes.length - 1; i++) {
    var act = (i === layerSizes.length - 2 && lossFunction === "cross_entropy") ? "softmax" : activation;
    layers.push({ input: layerSizes[i], output: layerSizes[i + 1], activation: act });
  }
  return new Network({
    layers: layers,
    lossFunction: lossFunction || "mse",
    learningRate: 0.1,
    momentum: 0.9,
    weightDecay: 0.0001
  });
}

// --- Ensemble ---

function ensemblePredict(networks, input) {
  if (!networks || networks.length === 0) return null;
  var outputs = [];
  for (var i = 0; i < networks.length; i++) {
    outputs.push(networks[i].predict(input));
  }
  // Media degli output
  var avg = new Array(outputs[0].length);
  for (var j = 0; j < avg.length; j++) {
    avg[j] = 0;
    for (var i = 0; i < outputs.length; i++) {
      avg[j] += outputs[i][j];
    }
    avg[j] /= outputs.length;
  }
  return avg;
}

// --- Utilità vettoriali ---

function dotProduct(a, b) {
  var sum = 0;
  for (var i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function cosineSimilarity(a, b) {
  var dot = 0, normA = 0, normB = 0;
  for (var i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  var denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function vectorAdd(a, b) {
  var r = new Array(a.length);
  for (var i = 0; i < a.length; i++) r[i] = a[i] + b[i];
  return r;
}

function vectorScale(a, s) {
  var r = new Array(a.length);
  for (var i = 0; i < a.length; i++) r[i] = a[i] * s;
  return r;
}

function vectorSub(a, b) {
  var r = new Array(a.length);
  for (var i = 0; i < a.length; i++) r[i] = a[i] - b[i];
  return r;
}

function randomVector(dim) {
  var v = new Array(dim);
  var scale = Math.sqrt(1.0 / dim);
  for (var i = 0; i < dim; i++) {
    v[i] = (Math.random() * 2 - 1) * scale;
  }
  return v;
}

function zeroVector(dim) {
  var v = new Array(dim);
  for (var i = 0; i < dim; i++) v[i] = 0;
  return v;
}

function averageVectors(vectors) {
  if (!vectors || vectors.length === 0) return null;
  var dim = vectors[0].length;
  var avg = zeroVector(dim);
  for (var i = 0; i < vectors.length; i++) {
    for (var j = 0; j < dim; j++) avg[j] += vectors[i][j];
  }
  for (var j = 0; j < dim; j++) avg[j] /= vectors.length;
  return avg;
}

function argmax(arr) {
  var maxIdx = 0;
  for (var i = 1; i < arr.length; i++) {
    if (arr[i] > arr[maxIdx]) maxIdx = i;
  }
  return maxIdx;
}

function oneHot(idx, size) {
  var v = zeroVector(size);
  v[idx] = 1;
  return v;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Classi
  Network: Network,
  Layer: Layer,
  // Factory
  createNetwork: createNetwork,
  // Attivazioni
  sigmoid: sigmoid,
  tanhAct: tanhAct,
  relu: relu,
  leakyRelu: leakyRelu,
  softmax: softmax,
  // Loss
  mseLoss: mseLoss,
  crossEntropyLoss: crossEntropyLoss,
  // Utilità vettoriali
  cosineSimilarity: cosineSimilarity,
  dotProduct: dotProduct,
  vectorAdd: vectorAdd,
  vectorSub: vectorSub,
  vectorScale: vectorScale,
  randomVector: randomVector,
  zeroVector: zeroVector,
  averageVectors: averageVectors,
  argmax: argmax,
  oneHot: oneHot,
  // Ensemble
  ensemblePredict: ensemblePredict,
  // Schedule
  scheduleLR: scheduleLR
};
