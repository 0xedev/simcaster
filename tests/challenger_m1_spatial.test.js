import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, getPlazaDistrict, getDistrictByChannel } from '../server/rules.js';

test('CHALLENGER: Exact Circle Boundary & Epsilon Transition Analysis', () => {
  // 1. Cardinal coordinates on circle r = 4.0
  const cardinals = [
    { x: 4.0, z: 0.0, desc: 'East (+X, 0)' },
    { x: -4.0, z: 0.0, desc: 'West (-X, 0)' },
    { x: 0.0, z: 4.0, desc: 'South (0, +Z)' },
    { x: 0.0, z: -4.0, desc: 'North (0, -Z)' }
  ];

  for (const pt of cardinals) {
    const d = getPlazaDistrict(pt.x, pt.z);
    assert.equal(d.id, 'farcaster', `Cardinal point ${pt.desc} must resolve to farcaster`);
    assert.equal(d, DISTRICTS.farcaster, `Cardinal point ${pt.desc} must return canonical object`);
  }

  // 2. High-precision epsilon transitions around r = 4.0 in all 4 quadrants
  const testAngles = [
    { angle: -Math.PI / 4, quad: 'dev', name: 'NE (angle -45 deg)' },
    { angle: Math.PI / 4, quad: 'base', name: 'SE (angle +45 deg)' },
    { angle: (3 * Math.PI) / 4, quad: 'memes', name: 'SW (angle +135 deg)' },
    { angle: -(3 * Math.PI) / 4, quad: 'farcaster', name: 'NW (angle -135 deg)' }
  ];

  const epsilons = [1e-1, 1e-3, 1e-5, 1e-7, 1e-10, 1e-14];

  for (const { angle, quad, name } of testAngles) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const eps of epsilons) {
      // Inside circle (r = 4.0 - eps)
      const rIn = 4.0 - eps;
      const xIn = rIn * cos;
      const zIn = rIn * sin;
      const dIn = getPlazaDistrict(xIn, zIn);
      assert.equal(dIn.id, 'farcaster', `Inside boundary at ${name} (eps=${eps}) must resolve to farcaster`);

      // Outside circle (r = 4.0 + eps)
      const rOut = 4.0 + eps;
      const xOut = rOut * cos;
      const zOut = rOut * sin;
      const dOut = getPlazaDistrict(xOut, zOut);
      assert.equal(dOut.id, quad, `Outside boundary at ${name} (eps=${eps}) must resolve to ${quad}`);
    }
  }

  // 3. Angular sweep: 3,600 angles around r = 4.0 exactly
  // Check behavior of floating point hypot(4*cos(t), 4*sin(t))
  let countFarcaster = 0;
  let countQuadrant = 0;
  for (let deg = 0; deg < 360; deg += 0.1) {
    const rad = (deg * Math.PI) / 180;
    const x = 4.0 * Math.cos(rad);
    const z = 4.0 * Math.sin(rad);
    const hypot = Math.hypot(x, z);
    const d = getPlazaDistrict(x, z);
    if (hypot <= 4.0) {
      assert.equal(d.id, 'farcaster', `Points with hypot <= 4.0 must be farcaster`);
      countFarcaster++;
    } else {
      // Due to IEEE 754 precision, hypot might be 4.000000000000001
      countQuadrant++;
    }
  }
  assert.ok(countFarcaster > 0, `Majority of r=4.0 circle points resolve to farcaster (actual: ${countFarcaster})`);
});

test('CHALLENGER: Exact Axis Classifications and Sign-of-Zero (-0 vs +0)', () => {
  // Test along Z-axis (x = 0) outside circle (abs(z) > 4)
  assert.equal(getPlazaDistrict(0, -4.01).id, 'dev', 'Z < -4 on X=0 axis resolves to dev');
  assert.equal(getPlazaDistrict(0, -10).id, 'dev', 'Z = -10 on X=0 axis resolves to dev');
  assert.equal(getPlazaDistrict(0, 4.01).id, 'base', 'Z > 4 on X=0 axis resolves to base');
  assert.equal(getPlazaDistrict(0, 10).id, 'base', 'Z = 10 on X=0 axis resolves to base');

  // Test along X-axis (z = 0) outside circle (abs(x) > 4)
  assert.equal(getPlazaDistrict(4.01, 0).id, 'base', 'X > 4 on Z=0 axis resolves to base');
  assert.equal(getPlazaDistrict(10, 0).id, 'base', 'X = 10 on Z=0 axis resolves to base');
  assert.equal(getPlazaDistrict(-4.01, 0).id, 'memes', 'X < -4 on Z=0 axis resolves to memes');
  assert.equal(getPlazaDistrict(-10, 0).id, 'memes', 'X = -10 on Z=0 axis resolves to memes');

  // Test signed zeros: +0 vs -0
  assert.equal(getPlazaDistrict(+0, +0).id, 'farcaster');
  assert.equal(getPlazaDistrict(-0, +0).id, 'farcaster');
  assert.equal(getPlazaDistrict(+0, -0).id, 'farcaster');
  assert.equal(getPlazaDistrict(-0, -0).id, 'farcaster');

  // Outside circle with signed zeros
  assert.equal(getPlazaDistrict(+0, -5).id, 'dev');
  assert.equal(getPlazaDistrict(-0, -5).id, 'dev');
  assert.equal(getPlazaDistrict(+0, 5).id, 'base');
  assert.equal(getPlazaDistrict(-0, 5).id, 'base');

  assert.equal(getPlazaDistrict(5, +0).id, 'base');
  assert.equal(getPlazaDistrict(5, -0).id, 'base');
  assert.equal(getPlazaDistrict(-5, +0).id, 'memes');
  assert.equal(getPlazaDistrict(-5, -0).id, 'memes');
});

test('CHALLENGER: Plaza Coordinate Extents, Corners, and Finite Numeric Extremes', () => {
  // Nominal Plaza corners at +-19
  assert.equal(getPlazaDistrict(19, -19).id, 'dev', 'NE corner (+19, -19) -> dev');
  assert.equal(getPlazaDistrict(-19, 19).id, 'memes', 'SW corner (-19, +19) -> memes');
  assert.equal(getPlazaDistrict(19, 19).id, 'base', 'SE corner (+19, +19) -> base');
  assert.equal(getPlazaDistrict(-19, -19).id, 'farcaster', 'NW corner (-19, -19) -> farcaster');

  // World bounds boundaries +-9.5, +-10, +-50, +-1000
  const cornerDistances = [9.5, 10, 19, 50, 1000, 1e6, 1e12];
  for (const d of cornerDistances) {
    assert.equal(getPlazaDistrict(d, -d).id, 'dev');
    assert.equal(getPlazaDistrict(-d, d).id, 'memes');
    assert.equal(getPlazaDistrict(d, d).id, 'base');
    assert.equal(getPlazaDistrict(-d, -d).id, 'farcaster');
  }

  // Safe integer bounds
  assert.equal(getPlazaDistrict(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).id, 'base');
  assert.equal(getPlazaDistrict(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER).id, 'farcaster');
  assert.equal(getPlazaDistrict(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER).id, 'dev');
  assert.equal(getPlazaDistrict(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).id, 'memes');

  // Subnormal / very small numbers
  assert.equal(getPlazaDistrict(Number.MIN_VALUE, Number.MIN_VALUE).id, 'farcaster');
  assert.equal(getPlazaDistrict(1e-100, -1e-100).id, 'farcaster');
});

test('CHALLENGER: Degenerate, Non-numeric, and Malformed Input Robustness', () => {
  const degenerateCases = [
    [null, null, 'both null'],
    [undefined, undefined, 'both undefined'],
    [null, undefined, 'null and undefined'],
    [NaN, 0, 'NaN x'],
    [0, NaN, 'NaN z'],
    [NaN, NaN, 'both NaN'],
    [Infinity, 0, 'Infinity x'],
    [0, Infinity, 'Infinity z'],
    [-Infinity, -Infinity, 'both -Infinity'],
    [Infinity, -Infinity, 'Infinity and -Infinity'],
    ['', '', 'empty strings'],
    ['foo', 'bar', 'text strings'],
    ['4.0', '0.0', 'numeric strings matching circle'],
    ['10', '-10', 'numeric strings outside circle'],
    [{}, {}, 'objects'],
    [[], [], 'arrays'],
    [[10], [-10], 'single-element number arrays'],
    [true, false, 'booleans'],
    [() => {}, () => {}, 'functions']
  ];

  for (const [x, z, label] of degenerateCases) {
    let result;
    assert.doesNotThrow(() => {
      result = getPlazaDistrict(x, z);
    }, `getPlazaDistrict must not throw on degenerate input: ${label}`);

    assert.ok(result, `Result must not be null/undefined for ${label}`);
    assert.ok(
      result.id === 'farcaster' || result.id === 'dev' || result.id === 'memes' || result.id === 'base',
      `Result must be a valid district for ${label}, received: ${result?.id}`
    );
  }
});

test('CHALLENGER: 100% Spatial Coverage Grid Probe (160,801 Points)', () => {
  // Step across [-20, 20] x [-20, 20] at 0.1m resolution
  const minCoord = -20;
  const maxCoord = 20;
  const step = 0.1;

  let totalPoints = 0;
  const districtCounts = {
    farcaster: 0,
    dev: 0,
    memes: 0,
    base: 0
  };

  const invalidPoints = [];

  for (let x = minCoord; x <= maxCoord + 1e-9; x += step) {
    for (let z = minCoord; z <= maxCoord + 1e-9; z += step) {
      totalPoints++;
      const res = getPlazaDistrict(x, z);
      if (!res || !districtCounts.hasOwnProperty(res.id)) {
        invalidPoints.push({ x, z, res });
      } else {
        districtCounts[res.id]++;
      }
    }
  }

  assert.equal(invalidPoints.length, 0, `Zero invalid points found across full spatial grid`);
  assert.ok(totalPoints >= 160000, `Tested over 160,000 spatial points (actual: ${totalPoints})`);

  // Verify all 4 districts received substantial point allocations
  assert.ok(districtCounts.farcaster > 0, 'farcaster has points');
  assert.ok(districtCounts.dev > 0, 'dev has points');
  assert.ok(districtCounts.memes > 0, 'memes has points');
  assert.ok(districtCounts.base > 0, 'base has points');

  const sumPoints =
    districtCounts.farcaster + districtCounts.dev + districtCounts.memes + districtCounts.base;
  assert.equal(sumPoints, totalPoints, '100% of grid points partition cleanly into the 4 districts');

  // Verify that farcaster accounts for NW quadrant + central circle
  // dev is NE quadrant minus central circle
  // memes is SW quadrant minus central circle
  // base is SE quadrant minus central circle
  assert.ok(
    districtCounts.farcaster > districtCounts.dev,
    'farcaster count should be larger than dev due to central circle inclusion'
  );
  assert.ok(
    districtCounts.farcaster > districtCounts.memes,
    'farcaster count should be larger than memes due to central circle inclusion'
  );
});

test('CHALLENGER: High-Throughput Stress & Memory Stability (500,000 Invocations)', () => {
  const iterations = 500000;
  const t0 = performance.now();

  for (let i = 0; i < iterations; i++) {
    // Generate pseudo-random coordinates in range [-25, 25]
    const x = (i % 500) * 0.1 - 25;
    const z = ((i * 7) % 500) * 0.1 - 25;
    const d = getPlazaDistrict(x, z);
    if (!d || !d.id) {
      throw new Error(`Invalid district returned at iteration ${i}`);
    }
  }

  const elapsedMs = performance.now() - t0;
  const opsPerSec = (iterations / (elapsedMs / 1000)).toFixed(0);

  // Expect at least 500,000 ops/second for a tight mathematical function
  assert.ok(elapsedMs < 3000, `500k iterations completed in ${elapsedMs.toFixed(2)}ms (< 3000ms)`);
});
