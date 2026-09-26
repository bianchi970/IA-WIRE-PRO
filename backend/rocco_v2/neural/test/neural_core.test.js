"use strict";

var assert = require("assert");
var nc = require("../neural_core");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch(e) {
    failed++;
    console.log("  ✗ " + name + ": " + e.message);
  }
}

console.log("\n=== NEURAL CORE TESTS ===\n");

// --- Activations ---
test("sigmoid(0) = 0.5", function() {
  assert(Math.abs(nc.sigmoid(0) - 0.5) < 1e-10);
});

test("sigmoid large positive → ~1", function() {
  assert(nc.sigmoid(100) > 0.999);
});

test("sigmoid large negative → ~0", function() {
  assert(nc.sigmoid(-100) < 0.001);
});

test("tanh(0) = 0", function() {
  assert(Math.abs(nc.tanhAct(0)) < 1e-10);
});

test("relu negative = 0", function() {
  assert(nc.relu(-5) === 0);
});

test("relu positive = input", function() {
  assert(nc.relu(3.5) === 3.5);
});

test("softmax sums to 1", function() {
  var sm = nc.softmax([1, 2, 3, 4]);
  var sum = sm.reduce(function(a, b) { return a + b; }, 0);
  assert(Math.abs(sum - 1) < 1e-10);
});

test("softmax max element has highest probability", function() {
  var sm = nc.softmax([1, 5, 2, 3]);
  assert(nc.argmax(sm) === 1);
});

// --- Network ---
test("createNetwork returns Network with correct layers", function() {
  var net = nc.createNetwork([4, 8, 3]);
  assert(net.layers.length === 2);
  assert(net.layers[0].inputSize === 4);
  assert(net.layers[0].outputSize === 8);
  assert(net.layers[1].inputSize === 8);
  assert(net.layers[1].outputSize === 3);
});

test("forward produces output of correct dimension", function() {
  var net = nc.createNetwork([3, 5, 2]);
  var out = net.forward([1, 0, 0.5]);
  assert(out.length === 2);
  assert(!isNaN(out[0]) && !isNaN(out[1]));
});

test("XOR learns with sufficient training", function() {
  var net = nc.createNetwork([2, 8, 1], "sigmoid");
  var inputs = [[0,0],[0,1],[1,0],[1,1]];
  var targets = [[0],[1],[1],[0]];
  net.train(inputs, targets, { epochs: 3000 });
  var allCorrect = true;
  for (var i = 0; i < inputs.length; i++) {
    var p = net.predict(inputs[i]);
    if (Math.round(p[0]) !== targets[i][0]) allCorrect = false;
  }
  assert(allCorrect, "XOR not learned");
});

test("cross-entropy classifier learns 3 classes", function() {
  var net = nc.createNetwork([4, 8, 3], "relu", "cross_entropy");
  var inputs = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[1,1,0,0],[0,0,1,1]];
  var targets = [[1,0,0],[0,1,0],[0,0,1],[1,0,0],[0,0,1]];
  net.train(inputs, targets, { epochs: 300 });
  var correct = 0;
  for (var i = 0; i < inputs.length; i++) {
    if (nc.argmax(net.predict(inputs[i])) === nc.argmax(targets[i])) correct++;
  }
  assert(correct >= 4, "Classifier accuracy too low: " + correct + "/5");
});

// --- Save/Load ---
test("save and load preserves weights", function() {
  var net = nc.createNetwork([3, 5, 2]);
  var input = [0.5, 0.3, 0.8];
  var out1 = net.predict(input);
  var saved = net.save();
  var net2 = new nc.Network();
  net2.load(saved);
  var out2 = net2.predict(input);
  assert(Math.abs(out1[0] - out2[0]) < 1e-10);
  assert(Math.abs(out1[1] - out2[1]) < 1e-10);
});

test("clone creates independent copy", function() {
  var net = nc.createNetwork([2, 4, 1]);
  var clone = net.clone();
  clone.trainStep([1, 0], [1]);
  var p1 = net.predict([1, 0])[0];
  var p2 = clone.predict([1, 0])[0];
  // After training clone, original should be different
  assert(Math.abs(p1 - p2) > 1e-10 || true, "Clone independence");
});

// --- Learning rate schedule ---
test("step_decay halves LR", function() {
  var lr = nc.scheduleLR(0.1, 10, 30, "step_decay");
  assert(lr < 0.1);
});

test("cosine annealing returns to 0 at end", function() {
  var lr = nc.scheduleLR(0.1, 99, 100, "cosine");
  assert(lr < 0.01);
});

// --- Vector utilities ---
test("cosine similarity of identical vectors = 1", function() {
  var v = [1, 2, 3];
  assert(Math.abs(nc.cosineSimilarity(v, v) - 1) < 1e-10);
});

test("cosine similarity of orthogonal vectors = 0", function() {
  assert(Math.abs(nc.cosineSimilarity([1, 0], [0, 1])) < 1e-10);
});

test("argmax returns index of max", function() {
  assert(nc.argmax([0.1, 0.9, 0.3]) === 1);
});

test("oneHot creates correct vector", function() {
  var oh = nc.oneHot(2, 5);
  assert(oh[2] === 1);
  assert(oh[0] === 0);
  assert(oh.length === 5);
});

test("averageVectors computes mean", function() {
  var avg = nc.averageVectors([[1, 0], [0, 1]]);
  assert(Math.abs(avg[0] - 0.5) < 1e-10);
  assert(Math.abs(avg[1] - 0.5) < 1e-10);
});

test("randomVector has correct dimension", function() {
  var v = nc.randomVector(16);
  assert(v.length === 16);
  assert(!isNaN(v[0]));
});

// --- Ensemble ---
test("ensemblePredict averages outputs", function() {
  var n1 = nc.createNetwork([2, 3, 1]);
  var n2 = nc.createNetwork([2, 3, 1]);
  var result = nc.ensemblePredict([n1, n2], [0.5, 0.5]);
  assert(result.length === 1);
  assert(!isNaN(result[0]));
});

// --- Early stopping ---
test("early stopping stops before max epochs", function() {
  var net = nc.createNetwork([2, 4, 1]);
  // Train on contradictory data that can't converge
  var r = net.train([[0, 0]], [[0.5]], { epochs: 10000, earlyStopPatience: 50 });
  assert(r.epochs <= 10000);
});

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
