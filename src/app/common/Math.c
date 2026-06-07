#pragma once

#include "../../unity.h"  // IWYU pragma: keep

// ---
// @class Math
// cross-platform deterministic math, vectors, matrices, quaternions, RNG, animation
//
// Function | Purpose
// --- | ---
// Math__ceil(n) | ceiling of float to unsigned int
// Math__floor(n) | floor of float to unsigned int
// Math__roundf(n) | round float to nearest integer
// Math__snap(n, inc) | round to nearest increment
// Math__map(n, a, b, c, d) | map domain a..b to range c..d
// Math__cmap(n, a, b, c, d) | clamp input + map
// Math__wrapaf(n, x, m, s) | wrap-around float: clamps x to range [n,m) by step s
// Math__fmodf(n, d) | float modulo operation
// Math__sign(n) | return -1.0 or +1.0 based on sign
// Math__fabsf(x) | absolute value of float
// Math__pow4(n) | raise to power of 4
// Math__powf(base, exponent) | power function
// Math__scalef(min, n, max) | scale float n between min and max
// Math__scaleu(min, n, max) | scale unsigned int n between min and max
// Math__aeq(a, b, epsilon) | approximate equality for lossy floats
//
// Math__sqrtf(n) | cross-platform deterministic square root
// Math__expf(x) | exponential (e^x) via Maclaurin series
//
// Math__trig_table_dump() | calculate and dump sine table values
// deg_norm(deg) | normalize angle to [0,360) degrees
// rad_norm(rad) | normalize radian to [0,2pi) radians
// Math__sin(nrad) | sine from lookup table
// Math__cos(nrad) | cosine from lookup table
// Math__tan(nrad) | tangent from sin/cos
// Math__asin(x) | arcsine (approximate)
// Math__acos(x) | arccosine
// Math__atan2(x, y) | arctangent2, direction to radian angle
//
// @class Random (RNG)
//
// Function | Purpose
// --- | ---
// Math__randomf(min, max, seed) | random float in range [min, max)
// Math__randomu(min, max, seed) | random unsigned int in range [min, max]
// Math__range(range, seed) | random float from Range struct
// Math__chance(chance, odds, seed) | probability check
// v2_rand(tl, br, seed) | random v2 within bounds
// v3_rand(tl, br, seed) | random v3 within bounds
// Math__snapZ(value, epsilon) | snap imperceptibly small values to zero
// v2_snapZ(v, epsilon) | snap v2 components to zero
// fullCircle() | random radian angle in [0,2pi]
// halfCircle() | random radian angle in [0,pi]
// quarterCircle() | random radian angle in [0,pi/2]
// angleAround(ang, maxDist) | random angle around given angle
// Math__distribute(totalValue, numStacks, maxPerStack, seed, dst) | distribute value across stacks
// Math__diminish(current, delta, seed) | diminishing returns calculation
//
// @class Vector (v1, v2, v3, v4)
//
// Function | Purpose
// --- | ---
// v3_set(dst, src) | copy v3
// v3_set3(dst, x, y, z) | set v3 components
// v3_equal(a, b) | v3 equality check
// v3_str(dst, len, a) | v3 to string
// v4_str(dst, len, a) | v4 to string
// v{1,2,3,4}_dot(a, b) | dot product
// v{1,2,3,4}_mag2(a) | magnitude squared
// v{1,2,3,4}_mag(a) | magnitude
// v2_dist(b, a) | distance between v2
// v2_dist2(b, a) | distance squared between v2
// v{1,2,3,4}_norm(a) | normalize to unit vector
// v3_pdiv(dst, a) | perspective division v3
// v4_pdiv(dst, a) | perspective division v4
// v2_cross(a, b) | 2D cross product (scalar)
// v3_cross(a, b) | 3D cross product (vector)
// v2_rot(pos, rad) | rotate 2D vector clockwise around origin
// v2_orbit(angle, radius) | 2D orbit around origin
// v2_orbit_around(pos, origin, radius, deltaAngle) | rotate around point
// v3_rotAA(v, rad, axis) | rotate v3 around axis by angle
// v{1,2,3,4}_{mul,div,add,sub}(a, b) | vector arithmetic
// v{1,2,3,4}_{mul,div,add,sub}S(a, s) | vector-scalar arithmetic
// v3_dist(b, a) | distance between v3
// v2_invert{,X,Y}(a) | swap/invert v2 components
// v2_limit(a, max) | limit v2 components to max
// v3_limit(a, max) | limit v3 components to max
// v2_clamp(a, n, m) | clamp v2 components to range
// v3_clamp(a, n, m) | clamp v3 components to range
// v3_dampenOver(a, max, factor) | dampen v3 components over threshold
// v3_dir(rot) | direction from Euler angles
//
// @class Matrix (m4)
//
// Function | Purpose
// --- | ---
// m4_str(dst, len, a) | m4 to string
// m4_set(dst, a) | copy m4
// m4_flip(a) | transpose m4 in-place
// m4_set4x4(...) | set m4 from 16 floats
// m4_trans(a) | translation matrix from v3
// m4_scale(a) | scale matrix from v3
// m4_rot(axis, rad) | rotation matrix from axis-angle
// m4_rotX(rad) | rotation matrix around X axis
// m4_rotY(rad) | rotation matrix around Y axis
// m4_rotZ(rad) | rotation matrix around Z axis
// m4_ortho_rh_no(l, r, b, t, n, f) | orthographic projection (RH, -1..1 Z)
// m4_persp_rh_no(fovy, aspect, n, f) | perspective projection (RH, -1..1 Z)
// m4_lookAt_rh(eye, target, up) | view matrix (RH)
// v3_orbit(lookAt, radius, angle) | orbit horizontally around point
// m4_mul(l, r) | multiply two m4
// m4_mul_v4(l, r) | multiply m4 by v4
// m4_inverse(m) | compute inverse of m4
//
// @class Quaternion (q)
//
// Function | Purpose
// --- | ---
// q_fromEuler(rot) | quaternion from Euler angles
// q_fromAxis(axis, angle) | quaternion from axis-angle
// q_mul(q1, q2) | multiply quaternions
// m4_fromQ(a) | m4 from quaternion
//
// @class Animation
//
// Function | Purpose
// --- | ---
// lerp(t, a, b) | linear interpolation
// lerpo(elapsed, offset, duration, loops) | calculate t with offset and looping
// v2_lerp(t, a, b) | 2-axis linear interpolation
// v3_lerp(t, a, b) | 3-axis linear interpolation
// v3_slerp(t, a, b) | spherical linear interpolation
// Math__wave4(t, period, a, b) | sine wave with custom t
// Math__wave(period, a, b) | sine wave using _G->now
// Math__swave(period, lo, hi) | square wave
// Math__linear(period, a, b) | linear triangular animation

u32 Math__ceil(f32 n) {
  u32 i = (u32)n;
  if (n == (f32)i) {
    return i;
  }
  return i + 1;
}

u32 Math__floor(f32 n) {
  u32 i = (u32)n;
  if (n < 0 && n != (f32)i) {
    return i - 1;
  }
  return i;
}

static inline f32 Math__roundf(f32 n) {
  return roundf(n);
}

// round to nearest increment
f32 Math__snap(f32 n, f32 inc) {
  if (inc <= 0.0f) {
    return n;  // avoid div/0
  }
  return Math__roundf(n / inc) * inc;
}

// map domain a..b to range c..d
static inline f32 Math__map(f32 n, f32 a, f32 b, f32 c, f32 d) {
  return c + (((d - c) * (n - a)) / (b - a));
}

// clamp input + map
static inline f32 Math__cmap(f32 n, f32 a, f32 b, f32 c, f32 d) {
  Math__clampb(a, n, b);
  return Math__map(n, a, b, c, d);
}

// wrap-around (float): clamps x to range [n,m) non-inclusive, by step s
static inline f32 Math__wrapaf(f32 n, f32 x, f32 m, f32 s) {
  while (x >= m) x -= s;
  while (x < n) x += s;
  return x;
}

f32 Math__fmodf(f32 n, f32 d) {
  if (n == 0.0f || d == 0.0f) {
    return 0.0f;  // 0 mod anything is 0
  }
  // handle division by zero
  if (d == 0.0f) {
    // undefined behavior
    return NaN32;
  }
  // handle infinity inputs
  if (n > Infinity32 || n < NInfinity32 || d > Infinity32 || d < NInfinity32) {
    return NaN32;  // NaN
  }

  u32 w = (u32)(n / d);  // truncate division result
  return n - (f32)w * d;  // calculate the remainder
}

static inline f32 Math__sign(f32 n) {
  return n < 0 ? -1.0f : +1.0f;
}

static inline f32 Math__fabsf(f32 x) {
  return (x < 0.0f) ? -x : x;
}

static inline f32 Math__pow4(f32 n) {
  return n * n * n * n;
}

static inline f32 Math__powf(f32 base, f32 exponent) {
  return powf(base, exponent);
}

static inline f32 Math__scalef(f32 min, f32 n, f32 max) {
  return min + n * (max - min);
}

static inline u32 Math__scaleu(u32 min, u32 n, u32 max) {
  return min + (n % (max - 1 - min + 1));
}

// approximate equality (for lossy floats)
static inline bool Math__aeq(f32 a, f32 b, f32 epsilon) {
  return Math__fabsf(a - b) < epsilon;
}

// BEGIN Geometry -------------------------------------------------------------

static inline f32 Math__sqrtf(f32 n) {
  // relying on advice that this one function
  // is already cross-platform deterministic
  return sqrtf(n);
}

// calc the exponential (e^x), where e is Euler's number
// (uses approximation of e) compute expf using a Maclaurin series
f32 Math__expf(f32 x) {
  static const u8 EXPF_ITER_MAX = 20;  // Number of terms in the series
  f32 term = 1.0f;  // First term in the series (x^0 / 0!)
  f32 result = term;  // Initialize the result with the first term

  for (u8 i = 1; i < EXPF_ITER_MAX; i++) {
    term *= x / i;  // Calculate the next term: (x^i / i!)
    result += term;  // Add the term to the result

    // Break early if the term becomes too small to matter
    if (term < 1e-6f && term > -1e-6f) {
      break;
    }
  }

  return result;
}

// END Geometry ---------------------------------------------------------------

// BEGIN Trig -----------------------------------------------------------------

static inline f32 lerp(f32 t, f32 a, f32 b);  // fwd decl

// calculate Sine table values
// CONVENTION: save/load from disk, so it's the same for all platforms
void Math__trig_table_dump(void) {
  for (u32 i = 0; i < Math__FINEANGLES; i++) {
    SIN_T[i] = sin(i * Math__FINE2RAD64);
    printf("%ff,", SIN_T[i]);
  }
}

// normalize angle to [0,360) degrees
static inline f32 deg_norm(f32 deg) {
  return Math__wrapaf(0.0f, deg, 360.0f, 360.0f);
}

// normalize radian to [0,2π) radians
static inline f32 rad_norm(f32 rad) {
  return Math__wrapaf(0.0f, rad, Math__TWOPI32, Math__TWOPI32);
}

// Sine
static inline f32 Math__sin(f32 nrad) {
  return SIN_T[(Math__RAD2FINE32(nrad) & Math__FINEANGLES_S1)];
}

// Cosine
static inline f32 Math__cos(f32 nrad) {
  return SIN_T[(Math__RAD2FINE32(nrad + Math__HALFPI32) & Math__FINEANGLES_S1)];
}

// Tangent
static inline f32 Math__tan(f32 nrad) {
  f32 sin_val = Math__sin(nrad);
  f32 cos_val = Math__cos(nrad);
  // avoid division by zero
  if (cos_val < EQ_ZEROF && cos_val > -EQ_ZEROF) {
    return 0.0f;
  }
  return sin_val / cos_val;
}

// Arcsine (approximate) (Cartesian 1D => Arc Degree)
f32 Math__asin(f32 x) {
  if (x < -1.0f || x > 1.0f) {
    return 0.0f;
  }
  f32 abs_x = x < 0.0f ? -x : x;
  f32 step = Math__HALFPI32 / Math__FINEANGLES_S1;
  f32 scaled = abs_x * Math__FINEANGLES_S1;
  u32 index = (u32)scaled;
  f32 frac = scaled - index;
  if (index >= Math__FINEANGLES_S1) {
    return x < 0.0f ? -Math__HALFPI32 : Math__HALFPI32;
  }
  f32 sin0 = SIN_T[index];
  f32 sin1 = SIN_T[index + 1];
  f32 angle0 = index * step;
  f32 angle1 = (index + 1) * step;
  f32 angle = angle0 + (angle1 - angle0) * (abs_x - sin0) / (sin1 - sin0);
  return x < 0.0f ? -angle : angle;
}

// Arccosine
static inline f32 Math__acos(f32 x) {
  return Math__HALFPI32 - Math__asin(x);
}

// Arctangent2 (convert direction to radian angle)
// CONVENTION: apply v2_norm() first
f32 Math__atan2(f32 x, f32 y) {
  // get angle from x-component
  f32 angle = Math__acos(x);

  // get correct quadrant from y-component's sign
  if (y < 0.0f) {
    angle = -angle;
  }

  return angle;
}

// END Trig -------------------------------------------------------------------

// BEGIN RNG ------------------------------------------------------------------

// Proper use & guidelines for determinism:
// - PRNG must use same seed on all platforms to produce identical sequences.
// - Synchronize the seed during initialization, typically as part of a handshake between server and client or shared via a configuration file.
// - Save the seed and seq counter as part of state for the RNG, so its available to log for debug.
// - Only store random values in fixed-width types like u32, f32.
// - Ensure all systems consume random numbers in the same order. (ie. extra call by one system or thread = desync)
//   - e.g., Use BitArray for thread fork/join ordered processing by main thread.
// - Use multiple seeds; one per sub-system; this will aid desync troubleshooting.

// Helper function to advance the seed and get the next RNG_T index
static inline u8 Math__randomNext(Seed* seed) {
  // Update LCG state: state = (A * state + C) mod M
  seed->state = (LCG_A * seed->state + LCG_C) & (LCG_M - 1);
  // Map state to an index in RNG_T (0 to 2047)
  seed->index = (seed->state >> 20) & (Math__RNG_CT - 1);  // Use high bits for better distribution
  return RNG_T[seed->index];
}

// Generate random float in range [min, max)
f32 Math__randomf(f32 min, f32 max, Seed* seed) {
  // Get random byte from table
  u8 value = Math__randomNext(seed);
  // Scale to [0, 1) by dividing by 256
  f32 fraction = (f32)value / 256.0f;
  // Scale to [min, max)
  return min + fraction * (max - min);
}

// Generate random unsigned int in range [min, max]
u32 Math__randomu(u32 min, u32 max, Seed* seed) {
  // Get random byte from table
  u8 value = Math__randomNext(seed);
  // Scale to [0, max - min] and shift to [min, max]
  u32 range = max - min + 1;
  return min + ((u32)value * range) / 256;
}

// Generate random float in range [min, max)
static inline f32 Math__range(Range range, Seed* seed) {
  return Math__randomf(range.min, range.max, seed);
}

static inline bool Math__chance(u32 chance, u32 odds, Seed* seed) {
  return Math__randomu(0, odds, seed) < chance;
}

static inline v2 v2_rand(v2 tl, v2 br, Seed* seed) {
  v2 dst;
  dst.x = Math__randomf(tl.x, br.x, seed);
  dst.y = Math__randomf(tl.y, br.y, seed);
  return dst;
}

static inline v3 v3_rand(v3 tl, v3 br, Seed* seed) {
  v3 dst;
  dst.x = Math__randomf(tl.x, br.x, seed);
  dst.y = Math__randomf(tl.y, br.y, seed);
  dst.z = Math__randomf(tl.z, br.z, seed);
  return dst;
}

// force imperceptibly small values to snap to zero
f32 Math__snapZ(f32 value, f32 epsilon) {
  if (Math__fabsf(value) < epsilon) {
    return 0.0f;
  }
  return value;
}

static inline v2 v2_snapZ(v2 v, f32 epsilon) {
  return (v2){Math__snapZ(v.x, epsilon), Math__snapZ(v.y, epsilon)};
}

// TODO: potentially implement these helpers

// // Generates a random f32 within a specified range to vary NPC attributes like speed or position.
// // usage: f32 npcSpeed = rnd(1.0f, 3.0f); // Sets NPC speed between 1 and 3 units/sec
// f32 rnd(f32 min, f32 max);

// // Generates a random integer within a specified range for discrete NPC properties like steps or choices.
// // usage: s32 npcSteps = irnd(5, 10); // NPC takes 5-10 steps forward
// s32 irnd(s32 min, s32 max);

// // Varies a f32 value by a percentage to add randomness to NPC attributes like health or damage.
// // usage: f32 npcHealth = around(100.0f, 10.0f); // Varies NPC health by ±10%
// f32 around(f32 v, f32 pct);

// // Varies an integer value by a percentage for randomizing discrete NPC properties like attack counts.
// // usage: s32 npcAttacks = iaround(5, 20); // Varies NPC attack count by ±20%
// s32 iaround(s32 v, s32 pct);

// // Returns -1 or 1 randomly to determine NPC movement direction or action polarity.
// // usage: f32 npcDir = sign(); // NPC moves left (-1) or right (1) f32 npcX += npcDir * 2.0f;
// s32 sign(void);

// // Varies a f32 value by a percentage, clamped to [0,1], for normalized NPC attributes like opacity or probability.
// // usage: f32 npcOpacity = aroundZTO(0.8f, 10); // Varies NPC opacity, clamped to [0,1]
// f32 aroundZTO(f32 v, f32 pct);

// // Varies a f32 value by a percentage, capped at 1, for NPC attributes that should not exceed a maximum, like health percentage.
// // usage: f32 npcHealthPct = aroundBO(0.9f, 15); // Varies NPC health percentage, capped at 1
// f32 aroundBO(f32 v, f32 pct);

// // Generates a random f32 from 0 to a given value for NPC movement distances or angles.
// // usage: f32 npcMoveDist = zeroTo(5.0f); // NPC moves 0-5 units
// f32 zeroTo(f32 v);

// // Generates a random f32 in [0,1] or [-1,1] if signed, for NPC decision probabilities or normalized attributes.
// // usage: f32 npcAttackChance = zto(false); // Probability (0-1) for NPC to attack if (npcAttackChance > 0.7f) attack();
// f32 zto(bool sign);

// Generates a random radian angle in [0,2π] for NPC rotation or movement direction.
// usage: f32 npcAngle = fullCircle(); // Random direction for NPC movement npcX += cos(npcAngle) * speed; npcY += sin(npcAngle) * speed;
static inline f32 fullCircle(void) {
  return Math__randomf(0.0f, Math__TWOPI32, &_G->seeds.nosync);
}

// Generates a random radian angle in [0,π] for limited NPC rotation or facing direction.
// usage: f32 npcFacing = halfCircle(); // NPC faces random angle in forward 180° npcRotation = npcFacing;
static inline f32 halfCircle(void) {  // aka disc
  return Math__randomf(0.0f, Math__PI32, &_G->seeds.nosync);
}

// Generates a random radian angle in [0,π/2] for constrained NPC movement angles.
// usage: f32 npcTurn = quarterCircle(); // NPC turns in a 90° arnpcRotation += npcTurn;
static inline f32 quarterCircle(void) {
  return Math__randomf(0.0f, Math__HALFPI32, &_G->seeds.nosync);
}

// Generates a random angle around a given angle, for slight NPC orientation variations.
// usage: f32 npcAim = angleAround(playerAngle, 0.2f); // NPC aims near player with ±0.2 rad variance npcRotation = npcAim;
static inline f32 angleAround(f32 ang, f32 maxDist) {
  return Math__randomf(ang - maxDist, ang + maxDist, &_G->seeds.nosync);
}

// // Returns true or false randomly for binary NPC decisions, like attack or retreat.
// // usage: if (flipCoin()) attackNPC(); // NPC randomly attacks or does nothing else idleNPC();
// bool flipCoin(void);

// // Returns true if a random percentage (0-100) is below a threshold, for NPC action probabilities.
// // usage: if (pct(30)) npcJump(); // 30% chance for NPC to jump
// bool pct(s32 thresholdOrBelow);

// // Returns true if a random percentage (0-1) is below a threshold, for precise NPC action probabilities.
// // usage: if (pctf(0.25f)) npcDodge(); // 25% chance for NPC to dodge
// bool pctf(f32 thresholdOrBelow);

// // Randomly chooses between two values with a given probability, for NPC behavior choices like left or right.
// // usage: Direction dir = *(Direction*)either(&left, &right, 0.6f); // 60% chance to go left npcMove(dir);
// void* either(void* a, void* b, f32 pctChanceForA);

// // Chooses between two values based on weights, for weighted NPC action selection.
// // usage: Action act = *(Action*)oneOf2(&attack, 0.7f, &defend, 0.3f); // 70% attack, 30% defend npcPerform(act);
// void* oneOf2(void* a, f32 aWeight, void* b, f32 bWeight);

// // Chooses among three values based on weights, for complex NPC decision-making.
// // usage: Action act = *(Action*)oneOf3(&attack, 0.5f, &defend, 0.3f, &flee, 0.2f); // Weighted NPC action npcPerform(act);
// void* oneOf3(void* a, f32 aWeight, void* b, f32 bWeight, void* c, f32 cWeight);

// // Randomly selects an element from an array, optionally removing it, for NPC item or target selection.
// // usage: Target targets[] = {t1, t2, t3}; Target* target = (Target*)pick(targets, 3, false); // Pick random target npcAttack(*target);
// void* pick(void* a, s32 length, bool removeAfterPick);

// // Shuffles an array in place, for randomizing NPC patrol routes or action sequences.
// // usage: Pos32 route[] = {p1, p2, p3, p4}; shuffleArray(route, 4, &rand); // Randomize NPC patrol route npcSetRoute(npc, route);
// void* shuffleArray(void* arr, s32 length, s32 (*randFunc)(s32));

// // Shuffles a vector in place, for randomizing NPC-related data structures like waypos32s.
// // usage: Vector waypos32s = allocVector(5); // Assume vector of waypos32s shuffleVector(waypos32s, 5, &rand); // Randomize NPC waypos32s npcFollow(waypos32s);
// void* shuffleVector(void* arr, s32 length, s32 (*randFunc)(s32));

// Distributes totalValue across numStacks stacks, with maxPerStack cap.
// Evenly distributes 1 to each stack, then randomly distributes the remainder.
// see also: Circle__pointAngle()
void Math__distribute(u8 totalValue, u8 numStacks, u8 maxPerStack, Seed* seed, u8* dst) {
  // Input validation
  if (totalValue < 0 || numStacks <= 0 || maxPerStack < 0) {
    return;
  }
  if (maxPerStack == 0) {
    maxPerStack = totalValue + 1;  // effectively no cap
  }
  if (totalValue >= numStacks && numStacks * maxPerStack < totalValue) {
    return;  // distribution not possible
  }

  // assign minimum 1 to each stack if possible
  u8 remaining = totalValue;
  u8 i;
  if (totalValue >= numStacks) {
    for (i = 0; i < numStacks; i++) {
      dst[i] = 1;
      remaining--;
    }
  } else {
    // If totalValue < numStacks, only assign to some stacks
    for (i = 0; i < totalValue; i++) {
      dst[i] = 1;
    }
    remaining = 0;
  }

  // randomly distribute remaining value
  while (remaining > 0) {
    // Pick a random stack
    u8 stackIndex = Math__randomu(0, numStacks, seed);

    // Check if adding 1 to this stack would exceed maxPerStack
    if (dst[stackIndex] < maxPerStack) {
      dst[stackIndex]++;
      remaining--;
    }
  }
}

// diminishing returns; provides incremental gains that become harder to achieve as stat increases.
// prevents runaway stat accumulation. keeps players grinding.
f32 Math__diminish(f32 current, f32 delta, Seed* seed) {
  static f32 arc = 3.0f;  // values 1..3 are reasonable (lower=faster decline)
  f32 dampen = arc * delta / (current + arc * delta);
  f32 randomValue = Math__randomf(0.0f, 1.0f, seed);
  f32 dcharge = dampen * delta * 0.5f * (1.0f + randomValue * dampen);
  return current + dcharge;
}

// END RNG --------------------------------------------------------

// BEGIN Vector (V1,V2,V3,V4), Matrix (M4), Euler (V3), Quaternion (V4) -------

// set

static inline void v3_set(v3* dst, const v3* src) {
  dst->x = src->x;
  dst->y = src->y;
  dst->z = src->z;
}

static inline void v3_set3(v3* dst, const f32 x, const f32 y, const f32 z) {
  dst->x = x;
  dst->y = y;
  dst->z = z;
}

// comparison

static inline bool v3_equal(const v3* a, const v3* b) {  // ==
  return a->x == b->x && a->y == b->y && a->z == b->z;
}

// serialization

void v3_str(char* dst, const u32 len, const v3* a) {  // toString
  snprintf(dst, len, "%f %f %f", a->x, a->y, a->z);
}

void v4_str(char* dst, const u32 len, const v4* a) {  // toString
  snprintf(dst, len, "%f %f %f %f", a->x, a->y, a->z, a->w);
}

void m4_str(char* dst, const u32 len, const m4* a) {  // toString
  // clang-format off
  snprintf(dst, len, "\n"
    "  %f %f %f %f\n"
    "  %f %f %f %f\n"
    "  %f %f %f %f\n"
    "  %f %f %f %f"
    , 
    a->ax, a->ay, a->az, a->aw,
    a->bx, a->by, a->bz, a->bw,
    a->cx, a->cy, a->cz, a->cw,
    a->dx, a->dy, a->dz, a->dw
  );
  // clang-format on
}

// dot product (a⋅b)

static inline f32 v1_dot(v1 a, v1 b) {
  return a.x * b.x;
}

static inline f32 v2_dot(v2 a, v2 b) {
  return a.x * b.x + a.y * b.y;
}

// can think of it as the length of an (opposite) side of a triangle
static inline f32 v3_dot(v3 a, v3 b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

static inline f32 v4_dot(v4 a, v4 b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

// magnitude squared
// because avoiding sqrt(x)) is computationally cheaper
// and often sufficient (e.g., for checking relative distances)

static inline f32 v1_mag2(v1 a) {
  return v1_dot(a, a);
}

static inline f32 v2_mag2(v2 a) {
  return v2_dot(a, a);
}

static inline f32 v3_mag2(v3 a) {
  return v3_dot(a, a);
}

static inline f32 v4_mag2(v4 a) {
  return v4_dot(a, a);
}

// magnitude

static inline f32 v1_mag(v1 a) {
  return Math__sqrtf(v1_mag2(a));
}

static inline f32 v2_mag(v2 a) {
  return Math__sqrtf(v2_mag2(a));
}

static inline f32 v3_mag(v3 a) {
  return Math__sqrtf(v3_mag2(a));
}

static inline f32 v4_mag(v4 a) {
  return Math__sqrtf(v4_mag2(a));
}

// distance

static inline v2 v2_sub(v2 a, v2 b);  // fwd decl

static inline f32 v2_dist(v2 b, v2 a) {
  return v2_mag(v2_sub(b, a));
}

static inline f32 v2_dist2(v2 b, v2 a) {
  return v2_mag2(v2_sub(b, a));
}

// normalize

// unit vector
static inline v1 v1_norm(v1 a) {
  f32 len = v1_mag(a);
  v1 dst;
  if (len > 0.0f) {
    dst.x = a.x / len;
  }
  return dst;
}

// unit vector
static inline v2 v2_norm(v2 a) {
  f32 len = v2_mag(a);
  v2 dst;
  if (len > 0.0f) {
    dst.x = a.x / len;
    dst.y = a.y / len;
  }
  return dst;
}

// unit vector
static inline v3 v3_norm(v3 a) {
  f32 len = v3_mag(a);
  v3 dst;
  if (len > 0.0f) {
    dst.x = a.x / len;
    dst.y = a.y / len;
    dst.z = a.z / len;
  }
  return dst;
}

// unit vector
static inline v4 v4_norm(v4 a) {
  f32 len = v4_mag(a);
  v4 dst;
  if (len > 0.0f) {
    dst.x = a.x / len;
    dst.y = a.y / len;
    dst.z = a.z / len;
    dst.w = a.w / len;
  }
  return dst;
}

// perspective division (homogenous coordinates)
void v3_pdiv(v3* dst, const v3* a) {
  dst->x = a->x / a->z;
  dst->y = a->y / a->z;
  dst->z = 1.0f;
}
void v4_pdiv(v4* dst, const v4* a) {
  dst->x = a->x / a->w;
  dst->y = a->y / a->w;
  dst->z = a->z / a->w;
  dst->w = 1.0f;
}

// cross product (a×b)

// 2D cross differs in that it returns a scalar,
// representing the perpendicular vector's magnitude
// if extended into 3D space.
// We can also think of it as the area of a parallelogram.
f32 v2_cross(v2 a, v2 b) {
  return a.x * b.y - a.y * b.x;
}

// 3D cross returns a new vector
// orthogonal (perpendicular) to both a and b
v3 v3_cross(v3 a, v3 b) {
  v3 dst;
  dst.x = a.y * b.z - a.z * b.y;
  dst.y = a.z * b.x - a.x * b.z;
  dst.z = a.x * b.y - a.y * b.x;
  return dst;
}

// Rotate 2D vector clockwise around the origin (right-handed)
v2 v2_rot(v2 pos, f32 rad) {
  v2 dst;
  f32 cos_a = Math__cos(rad);
  f32 sin_a = Math__sin(rad);

  // 2D rotation matrix (right-handed, clockwise for positive angle):
  // This matrix rotates the vector while preserving its magnitude, changing only its orientation.
  // [ cos θ,  sin θ ]
  // [-sin θ,  cos θ ]
  dst.x = pos.x * cos_a + pos.y * sin_a;
  dst.y = -pos.x * sin_a + pos.y * cos_a;

  return dst;
}

// 2D orbit around origin
// @param target - point to rotate around
// @param angle - Azimuthal angle (θ) in radians
// @param radius - uniform distance to maintain from target
// @return - new point (offset; add it to your target)
// CONVENTION: assumes angle is norm_rad()
v2 v2_orbit(f32 angle, f32 radius) {
  v2 dst = {
      // 1-axis orbit (ie. around Y-axis)
      .x = radius * Math__cos(angle),
      // NOTE: actually used as externally .z, but since its (v2) we call it .y  here
      .y = radius * Math__sin(angle),
  };
  return dst;
}

// rotate (2D) position around a given origin by a specified angle in radians,
// returning the new position.
v2 v2_orbit_around(v2* pos, v2* origin, f32 radius, f32 deltaAngle) {
  // Translate position relative to origin
  v2 rel_pos = {pos->x - origin->x, pos->y - origin->y};

  // Calculate current angle
  f32 current_angle = Math__atan2(rel_pos.y, rel_pos.x);

  // Add the angle delta
  f32 new_angle = current_angle + deltaAngle;

  // Calculate new position using polar coordinates with fixed radius
  v2 result;
  result.x = origin->x + radius * Math__cos(new_angle);
  result.y = origin->y + radius * Math__sin(new_angle);
  return result;
}

// rotate v3 v around v3 axis by rad angles
// CONVENTION: assume rad is rad_norm()
// CONVENTION: assume axis is v3_norm()
v3 v3_rotAA(v3 v, f32 rad, v3 axis) {
  f32 cosA = Math__cos(rad);
  f32 sinA = Math__sin(rad);

  f32 dot = v3_dot(v, axis);
  v3 cross = v3_cross(v, axis);

  v3 dst;
  // Rodrigues' rotation formula (RH)
  dst.x = v.x * cosA - cross.x * sinA + axis.x * dot * (1 - cosA);
  dst.y = v.y * cosA - cross.y * sinA + axis.y * dot * (1 - cosA);
  dst.z = v.z * cosA - cross.z * sinA + axis.z * dot * (1 - cosA);
  return dst;
}

// PEMDAS
// {mul,div,add,sub} *Scalar

// #metacode
// #macro MACRO1(T1)
//   {{~#for T1}}
//   // {{this.op}}
//   inline v1 v1_{{this.op}}(v1 a, v1 b) {
//     v1 dst;
//     dst.x = a.x {{this.oper}} b.x;
//     return dst;
//   }
//
//   inline v2 v2_{{this.op}}(v2 a, v2 b) {
//     v2 dst;
//     dst.x = a.x {{this.oper}} b.x;
//     dst.y = a.y {{this.oper}} b.y;
//     return dst;
//   }
//
//   inline v3 v3_{{this.op}}(v3 a, v3 b) {
//     v3 dst;
//     dst.x = a.x {{this.oper}} b.x;
//     dst.y = a.y {{this.oper}} b.y;
//     dst.z = a.z {{this.oper}} b.z;
//     return dst;
//   }
//
//   inline v4 v4_{{this.op}}(v4 a, v4 b) {
//     v4 dst;
//     dst.x = a.x {{this.oper}} b.x;
//     dst.y = a.y {{this.oper}} b.y;
//     dst.z = a.z {{this.oper}} b.z;
//     dst.w = a.w {{this.oper}} b.w;
//     return dst;
//   }
//
//   // {{this.op}} scalar
//
//   inline v1 v1_{{this.op}}S(v1 a, f32 s) {
//     v1 dst;
//     dst.x = a.x {{this.oper}} s;
//     return dst;
//   }
//
//   inline v2 v2_{{this.op}}S(v2 a, f32 s) {
//     v2 dst;
//     dst.x = a.x {{this.oper}} s;
//     dst.y = a.y {{this.oper}} s;
//     return dst;
//   }
//
//   inline v3 v3_{{this.op}}S(v3 a, f32 s) {
//     v3 dst;
//     dst.x = a.x {{this.oper}} s;
//     dst.y = a.y {{this.oper}} s;
//     dst.z = a.z {{this.oper}} s;
//     return dst;
//   }
//
//   inline v4 v4_{{this.op}}S(v4 a, f32 s) {
//     v4 dst;
//     dst.x = a.x {{this.oper}} s;
//     dst.y = a.y {{this.oper}} s;
//     dst.z = a.z {{this.oper}} s;
//     dst.w = a.w {{this.oper}} s;
//     return dst;
//   }
//   {{~/for~}}
//
// #table T_VARS
//   op  | oper |
//   mul | *    |
//   div | /    |
//   add | +    |
//   sub | -    |
//
// MACRO1(T_VARS)
// #metagen

// mul
static inline v1 v1_mul(v1 a, v1 b) {
  v1 dst;
  dst.x = a.x * b.x;
  return dst;
}

static inline v2 v2_mul(v2 a, v2 b) {
  v2 dst;
  dst.x = a.x * b.x;
  dst.y = a.y * b.y;
  return dst;
}

static inline v3 v3_mul(v3 a, v3 b) {
  v3 dst;
  dst.x = a.x * b.x;
  dst.y = a.y * b.y;
  dst.z = a.z * b.z;
  return dst;
}

static inline v4 v4_mul(v4 a, v4 b) {
  v4 dst;
  dst.x = a.x * b.x;
  dst.y = a.y * b.y;
  dst.z = a.z * b.z;
  dst.w = a.w * b.w;
  return dst;
}

// mul scalar

static inline v1 v1_mulS(v1 a, f32 s) {
  v1 dst;
  dst.x = a.x * s;
  return dst;
}

static inline v2 v2_mulS(v2 a, f32 s) {
  v2 dst;
  dst.x = a.x * s;
  dst.y = a.y * s;
  return dst;
}

static inline v3 v3_mulS(v3 a, f32 s) {
  v3 dst;
  dst.x = a.x * s;
  dst.y = a.y * s;
  dst.z = a.z * s;
  return dst;
}

static inline v4 v4_mulS(v4 a, f32 s) {
  v4 dst;
  dst.x = a.x * s;
  dst.y = a.y * s;
  dst.z = a.z * s;
  dst.w = a.w * s;
  return dst;
}

// div
static inline v1 v1_div(v1 a, v1 b) {
  v1 dst;
  dst.x = a.x / b.x;
  return dst;
}

static inline v2 v2_div(v2 a, v2 b) {
  v2 dst;
  dst.x = a.x / b.x;
  dst.y = a.y / b.y;
  return dst;
}

static inline v3 v3_div(v3 a, v3 b) {
  v3 dst;
  dst.x = a.x / b.x;
  dst.y = a.y / b.y;
  dst.z = a.z / b.z;
  return dst;
}

static inline v4 v4_div(v4 a, v4 b) {
  v4 dst;
  dst.x = a.x / b.x;
  dst.y = a.y / b.y;
  dst.z = a.z / b.z;
  dst.w = a.w / b.w;
  return dst;
}

// div scalar

static inline v1 v1_divS(v1 a, f32 s) {
  v1 dst;
  dst.x = a.x / s;
  return dst;
}

static inline v2 v2_divS(v2 a, f32 s) {
  v2 dst;
  dst.x = a.x / s;
  dst.y = a.y / s;
  return dst;
}

static inline v3 v3_divS(v3 a, f32 s) {
  v3 dst;
  dst.x = a.x / s;
  dst.y = a.y / s;
  dst.z = a.z / s;
  return dst;
}

static inline v4 v4_divS(v4 a, f32 s) {
  v4 dst;
  dst.x = a.x / s;
  dst.y = a.y / s;
  dst.z = a.z / s;
  dst.w = a.w / s;
  return dst;
}

// add
static inline v1 v1_add(v1 a, v1 b) {
  v1 dst;
  dst.x = a.x + b.x;
  return dst;
}

static inline v2 v2_add(v2 a, v2 b) {
  v2 dst;
  dst.x = a.x + b.x;
  dst.y = a.y + b.y;
  return dst;
}

static inline v3 v3_add(v3 a, v3 b) {
  v3 dst;
  dst.x = a.x + b.x;
  dst.y = a.y + b.y;
  dst.z = a.z + b.z;
  return dst;
}

static inline v4 v4_add(v4 a, v4 b) {
  v4 dst;
  dst.x = a.x + b.x;
  dst.y = a.y + b.y;
  dst.z = a.z + b.z;
  dst.w = a.w + b.w;
  return dst;
}

// add scalar

static inline v1 v1_addS(v1 a, f32 s) {
  v1 dst;
  dst.x = a.x + s;
  return dst;
}

static inline v2 v2_addS(v2 a, f32 s) {
  v2 dst;
  dst.x = a.x + s;
  dst.y = a.y + s;
  return dst;
}

static inline v3 v3_addS(v3 a, f32 s) {
  v3 dst;
  dst.x = a.x + s;
  dst.y = a.y + s;
  dst.z = a.z + s;
  return dst;
}

static inline v4 v4_addS(v4 a, f32 s) {
  v4 dst;
  dst.x = a.x + s;
  dst.y = a.y + s;
  dst.z = a.z + s;
  dst.w = a.w + s;
  return dst;
}

// sub
static inline v1 v1_sub(v1 a, v1 b) {
  v1 dst;
  dst.x = a.x - b.x;
  return dst;
}

static inline v2 v2_sub(v2 a, v2 b) {
  v2 dst;
  dst.x = a.x - b.x;
  dst.y = a.y - b.y;
  return dst;
}

static inline v3 v3_sub(v3 a, v3 b) {
  v3 dst;
  dst.x = a.x - b.x;
  dst.y = a.y - b.y;
  dst.z = a.z - b.z;
  return dst;
}

static inline v4 v4_sub(v4 a, v4 b) {
  v4 dst;
  dst.x = a.x - b.x;
  dst.y = a.y - b.y;
  dst.z = a.z - b.z;
  dst.w = a.w - b.w;
  return dst;
}

// sub scalar

static inline v1 v1_subS(v1 a, f32 s) {
  v1 dst;
  dst.x = a.x - s;
  return dst;
}

static inline v2 v2_subS(v2 a, f32 s) {
  v2 dst;
  dst.x = a.x - s;
  dst.y = a.y - s;
  return dst;
}

static inline v3 v3_subS(v3 a, f32 s) {
  v3 dst;
  dst.x = a.x - s;
  dst.y = a.y - s;
  dst.z = a.z - s;
  return dst;
}

static inline v4 v4_subS(v4 a, f32 s) {
  v4 dst;
  dst.x = a.x - s;
  dst.y = a.y - s;
  dst.z = a.z - s;
  dst.w = a.w - s;
  return dst;
}
// #metaend

static inline f32 v3_dist(v3 b, v3 a) {
  return v3_mag(v3_sub(b, a));
}

// invert [XYZ]

static inline v2 v2_invertX(v2 dst, v2 a) {
  dst.x = a.y;
  return dst;
}

static inline v2 v2_invertY(v2 dst, v2 a) {
  dst.y = a.x;
  return dst;
}

static inline v2 v2_invert(v2 a) {
  v2 dst;
  dst.x = a.y;
  dst.y = a.x;
  return dst;
}

static inline v2 v2_limit(v2 a, f32 max) {
  // clang-format off
  if (a.x > max) a.x = max;
  if (a.y > max) a.y = max;
  // clang-format on
  return a;
}

static inline v3 v3_limit(v3 a, f32 max) {
  // clang-format off
  if (a.x > max) a.x = max;
  if (a.y > max) a.y = max;
  if (a.z > max) a.z = max;
  // clang-format on
  return a;
}

static inline v2 v2_clamp(v2 a, f32 n, f32 m) {
  Math__clampb(n, a.x, m);
  Math__clampb(n, a.y, m);
  return a;
}

static inline v3 v3_clamp(v3 a, f32 n, f32 m) {
  Math__clampb(n, a.x, m);
  Math__clampb(n, a.y, m);
  Math__clampb(n, a.z, m);
  return a;
}

static inline v3 v3_dampenOver(v3 a, f32 max, f32 factor) {
  // clang-format off
  if (a.x > max) a.x = a.x * factor;
  if (a.y > max) a.y = a.y * factor;
  if (a.z > max) a.z = a.z * factor;
  // clang-format on
  return a;
}

// direction from rotation (Euler angles)
v3 v3_dir(v3 rot) {
  v3 dst;
  f32 pitch = rot.x * Math__DEG2RAD32;
  f32 yaw = rot.y * Math__DEG2RAD32;
  dst.x = Math__cos(yaw) * Math__cos(pitch);
  dst.y = Math__sin(pitch);  // Vertical component
  dst.z = Math__sin(yaw) * Math__cos(pitch);
  return dst;
}

// len, dist [Abs] [2|Sqrt] [XYZ]
// rot [*|To|By] (LH) [Deg|Rad] [XYZ]
// projectOnto
// vAng, hAng [Deg|Rad]

// matrix 4x4

void m4_set(m4* dst, const m4* a) {
  dst->ax = a->ax, dst->ay = a->ay, dst->az = a->az, dst->aw = a->aw;
  dst->bx = a->bx, dst->by = a->by, dst->bz = a->bz, dst->bw = a->bw;
  dst->cx = a->cx, dst->cy = a->cy, dst->cz = a->cz, dst->cw = a->cw;
  dst->dx = a->dx, dst->dy = a->dy, dst->dz = a->dz, dst->dw = a->dw;
}

static inline void _Math__swapf(f32* a, f32* b) {
  f32 c = *a;
  *a = *b;
  *b = c;
}

void m4_flip(m4* a) {
  _Math__swapf(&a->bx, &a->ay);
  _Math__swapf(&a->cx, &a->az);
  _Math__swapf(&a->dx, &a->aw);
  _Math__swapf(&a->cy, &a->bz);
  _Math__swapf(&a->dy, &a->bw);
  _Math__swapf(&a->dz, &a->cw);
}

// clang-format off
static inline m4 m4_set4x4(
  f32 c00, f32 c01, f32 c02, f32 c03,
  f32 c10, f32 c11, f32 c12, f32 c13,
  f32 c20, f32 c21, f32 c22, f32 c23,
  f32 c30, f32 c31, f32 c32, f32 c33
) {
  m4 dst;
  dst.ax = c00, dst.ay = c01, dst.az = c02, dst.aw = c03;
  dst.bx = c10, dst.by = c11, dst.bz = c12, dst.bw = c13;
  dst.cx = c20, dst.cy = c21, dst.cz = c22, dst.cw = c23;
  dst.dx = c30, dst.dy = c31, dst.dz = c32, dst.dw = c33;
  return dst;
}
// clang-format on

static inline m4 m4_trans(v3 a) {
  // clang-format off
  return m4_set4x4(
    1.0f, 0.0f, 0.0f, a.x,
    0.0f, 1.0f, 0.0f, a.y,
    0.0f, 0.0f, 1.0f, a.z,
    0.0f, 0.0f, 0.0f, 1.0f
  );
  // clang-format on
}

m4 m4_scale(v3 a) {
  // clang-format off
  m4 dst = m4_set4x4(
    a.x, 0.0f, 0.0f, 0.0f,
    0.0f, a.y, 0.0f, 0.0f,
    0.0f, 0.0f, a.z, 0.0f,
    0.0f, 0.0f, 0.0f, 1.0f
  );
  // clang-format on
  return dst;
}

// CONVENTION: assumes axis is v3_norm()
// CONVENTION: assumes rad is rad_norm()
// CONVENTION: assumes right-handed rotation
m4 m4_rot(v3 axis, f32 rad) {
  // rad = -rad; // LH
  // v3 b = v3_norm(axis);

  f32 SinTheta = Math__sin(rad);
  f32 CosTheta = Math__cos(rad);
  f32 CosValue = 1.0f - CosTheta;

  m4 dst;
  dst.ax = (axis.x * axis.x * CosValue) + CosTheta;
  dst.ay = (axis.x * axis.y * CosValue) + (axis.z * SinTheta);
  dst.az = (axis.x * axis.z * CosValue) - (axis.y * SinTheta);
  dst.aw = 0.0f;

  dst.bx = (axis.y * axis.x * CosValue) - (axis.z * SinTheta);
  dst.by = (axis.y * axis.y * CosValue) + CosTheta;
  dst.bz = (axis.y * axis.z * CosValue) + (axis.x * SinTheta);
  dst.bw = 0.0f;

  dst.cx = (axis.z * axis.x * CosValue) + (axis.y * SinTheta);
  dst.cy = (axis.z * axis.y * CosValue) - (axis.x * SinTheta);
  dst.cz = (axis.z * axis.z * CosValue) + CosTheta;
  dst.cw = 0.0f;

  dst.dx = 0.0f;
  dst.dy = 0.0f;
  dst.dz = 0.0f;
  dst.dw = 1.0f;
  return dst;
}

m4 m4_rotX(f32 rad) {  // LH
  f32 s = Math__sin(rad), c = Math__cos(rad);
  // clang-format off
  m4 dst = m4_set4x4(
    1.0f, 0.0f, 0.0f, 0.0f,
    0.0f, c, s, 0.0f,
    0.0f, -s, c, 0.0f,
    0.0f, 0.0f, 0.0f, 1.0f
  );
  // clang-format on
  return dst;
}

m4 m4_rotY(f32 rad) {  // LH
  f32 s = Math__sin(rad), c = Math__cos(rad);
  // clang-format off
  m4 dst = m4_set4x4(
    c, 0.0f, -s, 0.0f,
    0.0f, 1.0f, 0.0f, 0.0f,
    s, 0.0f, c, 0.0f,
    0.0f, 0.0f, 0.0f, 1.0f
  );
  // clang-format on
  return dst;
}

m4 m4_rotZ(f32 rad) {  // LH
  f32 s = Math__sin(rad), c = Math__cos(rad);
  // clang-format off
  m4 dst = m4_set4x4(
    c, s, 0.0f, 0.0f,
    -s, c, 0.0f, 0.0f,
    0.0f, 0.0f, 1.0f, 0.0f,
    0.0f, 0.0f, 0.0f, 1.0f
  );
  // clang-format on
  return dst;
}

// projection
// (LH=Left-Handed)
// (NO=Negative_one-to-One) Z ranging from -1..1
// NOTE: origin is centered, so dims should be given as -hw..+hw to get -1..1 NDC
// NOTE: anything outside n..f range will extrapolate outside z -1..1 NDC
// NOTE: n must never be set to 0! (avoids div/0)
// NOTE: f and n must always be positive! (or windings/normals will invert/flip)
// NOTE: OpenGL NDC is lbf -1,-1,-1 ... rtb 1,1,1

// orthographic projection matrix
// CONVENTION: we assume n < f
static inline m4 m4_ortho_rh_no(f32 l, f32 r, f32 b, f32 t, f32 n, f32 f) {
  m4 proj = {0};
  f32 rl = 1.0f / (r - l);
  f32 tb = 1.0f / (t - b);
  f32 fn = 1.0f / (f - n);
  // [ ax,       aw,
  //      by,    bw,
  //         cz, cw,
  //             dw, ]
  proj.ax = 2 * rl;
  proj.aw = -(r + l) * rl;
  proj.by = 2 * tb;
  proj.bw = -(t + b) * tb;
  proj.cz = -2 * fn;
  proj.cw = -(f + n) * fn;
  proj.dw = 1.0f;
  return proj;
}

// perspective projection matrix
static inline m4 m4_persp_rh_no(f32 fovy, f32 aspect, f32 n, f32 f) {
  m4 proj = {0};
  // cotangent of half-angle
  // NOTE: fovy is y-axis only
  f32 cha = 1.0f / Math__tan(rad_norm(fovy * 0.5f));
  f32 nf = 1.0f / (n - f);  // NOTE: RH uses n - f
  // [ ax,
  //      by,
  //         cz, cw,
  //         dz,     ]
  proj.ax = cha / aspect;  // X scaling (field of view / aspect ratio)
  proj.by = cha;  // Y scaling (field of view)
  proj.cz = (f + n) * nf;  // A  <- matches OpenGL
  proj.cw = (2.0f * f * n) * nf;  // B <- also RH
  proj.dz = -1.0f;
  return proj;
}

// Creates a view matrix for a camera.
// @param eye Camera position.
// @param target Point the camera is looking at.
// @param up Up direction (typically (0, 1, 0) for world-up).
//        NOTE: `up` is the axis that rotation happens around!
m4 m4_lookAt_rh(v3 eye, v3 target, v3 up) {
  v3 forward = v3_norm(v3_sub(target, eye));  // -Z forward
  v3 side = v3_norm(v3_cross(forward, up));  // +X right
  v3 up_new = v3_cross(side, forward);  // +Y up

  m4 view = {0};
  // Rotation
  view.ax = side.x, view.ay = side.y, view.az = side.z;
  view.bx = up_new.x, view.by = up_new.y, view.bz = up_new.z;
  view.cx = -forward.x, view.cy = -forward.y, view.cz = -forward.z;
  view.dw = 1.0f;

  // Translation
  view.aw = -v3_dot(side, eye);
  view.bw = -v3_dot(up_new, eye);
  view.cw = v3_dot(forward, eye);  // negative forward
  return view;
}

// orbit horizontally around a point
v3 v3_orbit(v3 lookAt, f32 radius, f32 angle) {
  v3 pos = {0};
  f32 rad = deg_norm(angle) * Math__DEG2RAD32;
  pos.x = lookAt.x + radius * Math__cos(rad);
  pos.z = lookAt.z + radius * Math__sin(rad);
  pos.y = lookAt.y;  // constant due to horizontal orbit
  // pos.x = lookAt.x + radius * Math__cos(rad);
  // pos.y = lookAt.y + radius * Math__sin(rad);
  // pos.z = lookAt.z;  // constant due to horizontal orbit
  return pos;
}

// quaternions

v4 q_fromEuler(v3 rot) {
  // convert degrees to half angles in radians
  f32 cx = Math__cos(Math__DEG2RAD32 * rot.x * 0.5f);
  f32 sx = Math__sin(Math__DEG2RAD32 * rot.x * 0.5f);
  f32 cy = Math__cos(Math__DEG2RAD32 * rot.y * 0.5f);
  f32 sy = Math__sin(Math__DEG2RAD32 * rot.y * 0.5f);
  f32 cz = Math__cos(Math__DEG2RAD32 * rot.z * 0.5f);
  f32 sz = Math__sin(Math__DEG2RAD32 * rot.z * 0.5f);

  v4 dst;
  dst.x = sx * cy * cz - cx * sy * sz;
  dst.y = cx * sy * cz + sx * cy * sz;
  dst.z = cx * cy * sz - sx * sy * cz;
  dst.w = cx * cy * cz + sx * sy * sz;
  return dst;
}

v4 q_fromAxis(v3 axis, f32 angle) {
  v4 dst;
  if (0.0f == axis.x + axis.y + axis.z) {
    dst.x = dst.y = dst.z = 0.0f, dst.w = 1.0f;  // Identity quaternion
    return dst;
  }

  v3 _axis = v3_norm(axis);

  // compute sine and cosine of half the angle
  f32 halfAngle = angle * 0.5f;
  f32 sinHalfAngle = Math__sin(halfAngle);
  f32 cosHalfAngle = Math__cos(halfAngle);

  // create the quaternion
  dst.x = _axis.x * sinHalfAngle;
  dst.y = _axis.y * sinHalfAngle;
  dst.z = _axis.z * sinHalfAngle;
  dst.w = cosHalfAngle;
  return dst;
}

v4 q_mul(v4 q1, v4 q2) {
  v4 dst;
  dst.x = q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y;
  dst.y = q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x;
  dst.z = q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w;
  dst.w = q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z;
  return dst;
}

m4 m4_fromQ(v4 a) {
  f32 xx = a.x * a.x;
  f32 yy = a.y * a.y;
  f32 zz = a.z * a.z;
  f32 xy = a.x * a.y;
  f32 xz = a.x * a.z;
  f32 yz = a.y * a.z;
  f32 wx = a.w * a.x;
  f32 wy = a.w * a.y;
  f32 wz = a.w * a.z;

  m4 dst;
  dst.ax = 1.0f - 2.0f * (yy + zz);
  dst.ay = 2.0f * (xy + wz);
  dst.az = 2.0f * (xz - wy);
  dst.aw = 0.0f;

  dst.bx = 2.0f * (xy - wz);
  dst.by = 1.0f - 2.0f * (xx + zz);
  dst.bz = 2.0f * (yz + wx);
  dst.bw = 0.0f;

  dst.cx = 2.0f * (xz + wy);
  dst.cy = 2.0f * (yz - wx);
  dst.cz = 1.0f - 2.0f * (xx + yy);
  dst.cw = 0.0f;

  dst.dx = 0.0f;
  dst.dy = 0.0f;
  dst.dz = 0.0f;
  dst.dw = 1.0f;
  return dst;
}

m4 m4_mul(m4 l, m4 r) {
  m4 dst;
  // a
  dst.ax = l.ax * r.ax;
  dst.ay = l.ax * r.ay;
  dst.az = l.ax * r.az;
  dst.aw = l.ax * r.aw;

  dst.ax += l.ay * r.bx;
  dst.ay += l.ay * r.by;
  dst.az += l.ay * r.bz;
  dst.aw += l.ay * r.bw;

  dst.ax += l.az * r.cx;
  dst.ay += l.az * r.cy;
  dst.az += l.az * r.cz;
  dst.aw += l.az * r.cw;

  dst.ax += l.aw * r.dx;
  dst.ay += l.aw * r.dy;
  dst.az += l.aw * r.dz;
  dst.aw += l.aw * r.dw;

  // b
  dst.bx = l.bx * r.ax;
  dst.by = l.bx * r.ay;
  dst.bz = l.bx * r.az;
  dst.bw = l.bx * r.aw;

  dst.bx += l.by * r.bx;
  dst.by += l.by * r.by;
  dst.bz += l.by * r.bz;
  dst.bw += l.by * r.bw;

  dst.bx += l.bz * r.cx;
  dst.by += l.bz * r.cy;
  dst.bz += l.bz * r.cz;
  dst.bw += l.bz * r.cw;

  dst.bx += l.bw * r.dx;
  dst.by += l.bw * r.dy;
  dst.bz += l.bw * r.dz;
  dst.bw += l.bw * r.dw;

  // c
  dst.cx = l.cx * r.ax;
  dst.cy = l.cx * r.ay;
  dst.cz = l.cx * r.az;
  dst.cw = l.cx * r.aw;

  dst.cx += l.cy * r.bx;
  dst.cy += l.cy * r.by;
  dst.cz += l.cy * r.bz;
  dst.cw += l.cy * r.bw;

  dst.cx += l.cz * r.cx;
  dst.cy += l.cz * r.cy;
  dst.cz += l.cz * r.cz;
  dst.cw += l.cz * r.cw;

  dst.cx += l.cw * r.dx;
  dst.cy += l.cw * r.dy;
  dst.cz += l.cw * r.dz;
  dst.cw += l.cw * r.dw;

  // d
  dst.dx = l.dx * r.ax;
  dst.dy = l.dx * r.ay;
  dst.dz = l.dx * r.az;
  dst.dw = l.dx * r.aw;

  dst.dx += l.dy * r.bx;
  dst.dy += l.dy * r.by;
  dst.dz += l.dy * r.bz;
  dst.dw += l.dy * r.bw;

  dst.dx += l.dz * r.cx;
  dst.dy += l.dz * r.cy;
  dst.dz += l.dz * r.cz;
  dst.dw += l.dz * r.cw;

  dst.dx += l.dw * r.dx;
  dst.dy += l.dw * r.dy;
  dst.dz += l.dw * r.dz;
  dst.dw += l.dw * r.dw;

  return dst;
}

// multiply mat4 x vec4 = vec4
v4 m4_mul_v4(m4 l, v4 r) {
  v4 dst;
  dst.x = l.ax * r.x + l.ay * r.y + l.az * r.z + l.aw * r.w;
  dst.y = l.bx * r.x + l.by * r.y + l.bz * r.z + l.bw * r.w;
  dst.z = l.cx * r.x + l.cy * r.y + l.cz * r.z + l.cw * r.w;
  dst.w = l.dx * r.x + l.dy * r.y + l.dz * r.z + l.dw * r.w;
  return dst;
}

// compute the inverse of a 4x4 matrix
m4 m4_inverse(m4 m) {
  m4 inv;
  f32 det;

  f32 A2323 = m.cz * m.dw - m.dz * m.cw;
  f32 A1323 = m.bz * m.dw - m.dz * m.bw;
  f32 A1223 = m.bz * m.cw - m.cz * m.bw;
  f32 A0323 = m.az * m.dw - m.dz * m.aw;
  f32 A0223 = m.az * m.cw - m.cz * m.aw;
  f32 A0123 = m.az * m.bw - m.bz * m.aw;

  f32 A2313 = m.cy * m.dw - m.dy * m.cw;
  f32 A1313 = m.by * m.dw - m.dy * m.bw;
  f32 A1213 = m.by * m.cw - m.cy * m.bw;
  f32 A0313 = m.ay * m.dw - m.dy * m.aw;
  f32 A0213 = m.ay * m.cw - m.cy * m.aw;
  f32 A0113 = m.ay * m.bw - m.by * m.aw;

  f32 A2303 = m.cy * m.dz - m.dy * m.cz;
  f32 A1303 = m.by * m.dz - m.dy * m.bz;
  f32 A1203 = m.by * m.cz - m.cy * m.bz;
  f32 A0303 = m.ay * m.dz - m.dy * m.az;
  f32 A0203 = m.ay * m.cz - m.cy * m.az;
  f32 A0103 = m.ay * m.bz - m.by * m.az;

  f32 A2312 = m.cx * m.dw - m.dx * m.cw;
  f32 A1312 = m.bx * m.dw - m.dx * m.bw;
  f32 A1212 = m.bx * m.cw - m.cx * m.bw;
  f32 A0312 = m.ax * m.dw - m.dx * m.aw;
  f32 A0212 = m.ax * m.cw - m.cx * m.aw;
  f32 A0112 = m.ax * m.bw - m.bx * m.aw;

  f32 A2302 = m.cx * m.dz - m.dx * m.cz;
  f32 A1302 = m.bx * m.dz - m.dx * m.bz;
  f32 A1202 = m.bx * m.cz - m.cx * m.bz;
  f32 A0302 = m.ax * m.dz - m.dx * m.az;
  f32 A0202 = m.ax * m.cz - m.cx * m.az;
  f32 A0102 = m.ax * m.bz - m.bx * m.az;

  f32 A2311 = m.cx * m.dy - m.dx * m.cy;
  f32 A1311 = m.bx * m.dy - m.dx * m.by;
  f32 A1211 = m.bx * m.cy - m.cx * m.by;
  f32 A0311 = m.ax * m.dy - m.dx * m.ay;
  f32 A0211 = m.ax * m.cy - m.cx * m.ay;
  f32 A0111 = m.ax * m.by - m.bx * m.ay;

  inv.ax = +m.by * A2323 - m.cy * A1323 + m.dy * A1223;
  inv.bx = -m.bx * A2323 + m.cx * A1323 - m.dx * A1223;
  inv.cx = +m.bx * A2313 - m.cx * A1313 + m.dx * A1213;
  inv.dx = -m.bx * A2303 + m.cx * A1303 - m.dx * A1203;

  inv.ay = -m.ay * A2323 + m.cy * A0323 - m.dy * A0223;
  inv.by = +m.ax * A2323 - m.cx * A0323 + m.dx * A0223;
  inv.cy = -m.ax * A2313 + m.cx * A0313 - m.dx * A0213;
  inv.dy = +m.ax * A2303 - m.cx * A0303 + m.dx * A0203;

  inv.az = +m.ay * A1323 - m.by * A0323 + m.dy * A0123;
  inv.bz = -m.ax * A1323 + m.bx * A0323 - m.dx * A0123;
  inv.cz = +m.ax * A1313 - m.bx * A0313 + m.dx * A0113;
  inv.dz = -m.ax * A1303 + m.bx * A0303 - m.dx * A0103;

  inv.aw = -m.ay * A1223 + m.by * A0223 - m.cy * A0123;
  inv.bw = +m.ax * A1223 - m.bx * A0223 + m.cx * A0123;
  inv.cw = -m.ax * A1213 + m.bx * A0213 - m.cx * A0113;
  inv.dw = +m.ax * A1203 - m.bx * A0203 + m.cx * A0103;

  det = m.ax * inv.ax + m.ay * inv.bx + m.az * inv.cx + m.aw * inv.dx;

  if (det == 0.0f) {
    return M4_IDENTITY;
  }

  f32 inv_det = 1.0f / det;

  inv.ax *= inv_det;
  inv.bx *= inv_det;
  inv.cx *= inv_det;
  inv.dx *= inv_det;
  inv.ay *= inv_det;
  inv.by *= inv_det;
  inv.cy *= inv_det;
  inv.dy *= inv_det;
  inv.az *= inv_det;
  inv.bz *= inv_det;
  inv.cz *= inv_det;
  inv.dz *= inv_det;
  inv.aw *= inv_det;
  inv.bw *= inv_det;
  inv.cw *= inv_det;
  inv.dw *= inv_det;

  return inv;
}

// END Vector (V1,V2,V3,V4), Matrix (M4), Euler (V3), Quaternion (V4) ---------

// BEGIN Anim -----------------------------------------------------------------

// linear interpolation (% between a..b) a.k.a. lerp/mix
// follows a straight line.
// usage: lerp(0.5,2.0,3.0); // == 2.5; // half-way between 2 and 3.
// NOTICE: highly versatile fn; how you calc t is everything!
// e.g., for frame-rate independence: t = % between start..stop (wall-clock time)
// CONVENTION: expects t to be 0..1.
static inline f32 lerp(f32 t, f32 a, f32 b) {
  // Math__clampb(0.0f, t, 1.0f);  // valid range
  return a + ((b - a) * t);
}

// calculate t after a given offset with looping (for group lerp)
// usage: lerp(lerpo(lap, offset, duration, loops), a, b);
static inline f32 lerpo(f32 elapsed, f32 offset, f32 duration, u32 loops) {
  f32 local_elapsed = elapsed - offset;
  // clang-format off
  if (local_elapsed < 0.0f) { return 0.0f; } // hasn't begun
  if (duration <= 0.0f) { return 1.0f; } // negative or zero duration
  // (if not infinite looping and) past total duration
  if (0 != loops && local_elapsed >= duration * loops) { return 1.0f; }
  // clang-format on
  // Calculate t within one loop cycle
  f32 t = Math__fmodf(local_elapsed, duration) / duration;
  return t;
}

// 2-axis linear interpolation
static inline v2 v2_lerp(f32 t, v2 a, v2 b) {
  v2 pos;
  pos.x = lerp(t, a.x, b.x);
  pos.y = lerp(t, a.y, b.y);
  return pos;
}

// 3-axis linear interpolation
static inline v3 v3_lerp(f32 t, v3 a, v3 b) {
  v3 pos;
  pos.x = lerp(t, a.x, b.x);
  pos.y = lerp(t, a.y, b.y);
  pos.z = lerp(t, a.z, b.z);
  return pos;
}

// spherical linear interpolation (% between two rotation vectors)
// follows an arc on the unit sphere/circle.
// CONVENTION: expects t to be 0..1.
// CONVENTION: expects a and b to be v3_norm().
v3 v3_slerp(f32 t, v3 a, v3 b) {
  // Math__clampb(0.0f, t, 1.0f);  // valid range

  // calc angle between vectors
  f32 cos_theta = v3_dot(a, b);
  Math__clampb(-1.0f, cos_theta, 1.0f);  // valid range
  f32 theta = Math__acos(cos_theta) * t;  // interpolated angle

  // orthogonal vector
  v3 r;
  r.x = b.x - a.x * cos_theta;
  r.y = b.y - a.y * cos_theta;
  r.z = b.z - a.z * cos_theta;
  r = v3_norm(r);

  // rotate vector a toward vector b by fraction t (of the angle between them)
  r.x = a.x * Math__cos(theta) + r.x * Math__sin(theta);
  r.y = a.y * Math__cos(theta) + r.y * Math__sin(theta);
  r.z = a.z * Math__cos(theta) + r.z * Math__sin(theta);
  return r;
}

// NOTE: provide custom value for t
f32 Math__wave4(u64 t, u32 period, f32 a, f32 b) {
  f32 phase = Math__sin((Math__fmodf(t, period) / period) * Math__TWOPI32);
  return Math__map(phase, -1.0f, 1.0f, a, b);
}

// sine wave
// ie. Math__wave(3*1000/*ms*/, 0.0, 1.0f);
f32 Math__wave(u32 period, f32 a, f32 b) {
  return Math__wave4(_G->now, period, a, b);
}

// square wave
// ie. Math__wave(3*1000/*ms*/, 0.0, 1.0f);
f32 Math__swave(u32 period, f32 lo, f32 hi) {
  u32 phase = _G->now % period;
  return (phase < period / 2) ? hi : lo;
}

// linear animate
// ie. Math__linear(3*1000/*ms*/, 0.0, 1.0f);
// NOTE: assumes b is always greater than a (reorder if not true)
f32 Math__linear(u32 period, f32 a, f32 b) {
  // Compute t in [0, 1] based on current time and period
  f32 t = (_G->now % period) / (f32)period;

  // Map t to a triangular wave: u goes 0 -> 1 -> 0 as t goes 0 -> 0.5 -> 1
  f32 u = 1.0f - 2.0f * Math__fabsf(t - 0.5f);

  // Linear interpolation: works for b < a (e.g., 0 to -40) due to (b - a) sign
  return a + (b - a) * u;
}

// typedef struct {
//   f32 percentage;
//   f32 value;
// } GradientStop;

// f32 Math__gradient(f32 n, f32 a, f32 b, u32 stop_ct, ...) {
//   if (stop_ct < 1 || a == b) {
//     return 0.0f;  // edge cases
//   }

//   // Normalize input n to [0,1] based on domain [a,b]
//   f32 t = (n - a) / (b - a);
//   t = Math__clampi(0.0f, t, 1.0f);  // Clamp to [0,1]

//   // Initialize variable argument list
//   va_list args;
//   va_start(args, stop_ct);

//   // Read all stops
//   GradientStop stops[stop_ct];
//   for (u8 i = 0; i < stop_ct; i += 2) {
//     f32 percentage = va_arg(args, f64);
//     f32 value = va_arg(args, f64);
//     if (stop_ct == 1) {
//       return value;
//     }
//     stops[i / 2] = (GradientStop){percentage, value};
//     stops[i].percentage = Math__clampi(0.0f, stops[i].percentage, 1.0f);
//   }
//   va_end(args);

//   // Find the two stops to interpolate between
//   if (t <= stops[0].percentage) {
//     return stops[0].value;
//   }
//   if (t >= stops[stop_ct - 1].percentage) {
//     return stops[stop_ct - 1].value;
//   }

//   for (u8 i = 0; i < stop_ct - 1; i++) {
//     if (t >= stops[i].percentage && t <= stops[i + 1].percentage) {
//       // Linear interpolation between stops[i] and stops[i+1]
//       f32 t_local = (t - stops[i].percentage) / (stops[i + 1].percentage - stops[i].percentage);
//       return stops[i].value + t_local * (stops[i + 1].value - stops[i].value);
//     }
//   }

//   // Should never reach here if stops are properly sorted
//   return 0.0f;
// }

// END Anim -------------------------------------------------------------------
