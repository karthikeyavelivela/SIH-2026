module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  // Each suite starts its own in-memory MongoDB. One worker per core (21 on
  // a 22-core machine) starved them and timed suites out at random; half the
  // cores runs the whole suite green and about three times faster.
  maxWorkers: '50%',
};
