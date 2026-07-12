function assert(value, message = "Assertion failed") {
  if (!value) throw new Error(message);
}

assert.ok = assert;
assert.equal = (actual, expected, message) => assert(actual == expected, message);
assert.notEqual = (actual, expected, message) => assert(actual != expected, message);
assert.strictEqual = (actual, expected, message) => assert(actual === expected, message);
assert.notStrictEqual = (actual, expected, message) => assert(actual !== expected, message);
assert.deepStrictEqual = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), message);
assert.AssertionError = class AssertionError extends Error {};

export { assert };
export default assert;
