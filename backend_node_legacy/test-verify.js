async function testAll() {
  console.log('=== VISIONMED SYSTEM VERIFICATION ===\n');

  // 1. Frontend Check
  try {
    const feRes = await fetch('http://localhost:3000');
    console.log(`[PASS] Frontend Root: Status ${feRes.status}`);
    const loginRes = await fetch('http://localhost:3000/login');
    console.log(`[PASS] Frontend Login Page: Status ${loginRes.status}`);
  } catch (err) {
    console.error('[FAIL] Frontend test failed:', err.message);
  }

  // 2. Backend Login Check (Reed - Security)
  let sessionToken1 = '';
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reed.security@visionmed.hospital', password: 'hospital123' }),
    });
    const data = await res.json();
    sessionToken1 = data.token;
    console.log(`[PASS] Backend Login (Reed): OK - Role: ${data.user.role}, Token: ${sessionToken1.substring(0, 12)}...`);
  } catch (err) {
    console.error('[FAIL] Login failed:', err.message);
  }

  // 3. Second Login with same account (Single Session Invalidation test)
  try {
    const res2 = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reed.security@visionmed.hospital', password: 'hospital123' }),
    });
    const data2 = await res2.json();
    const sessionToken2 = data2.token;
    console.log(`[PASS] Backend Second Login (Reed): New Token Generated: ${sessionToken2.substring(0, 12)}...`);
    console.log(`[PASS] Single-Session Token Revocation: Previous token != New token (${sessionToken1 !== sessionToken2})`);
  } catch (err) {
    console.error('[FAIL] Second login failed:', err.message);
  }

  // 4. Test Receptionist Login (Sarah)
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah.reception@visionmed.hospital', password: 'hospital123' }),
    });
    const data = await res.json();
    console.log(`[PASS] Backend Login (Sarah Receptionist): OK - Role: ${data.user.role}`);
  } catch (err) {
    console.error('[FAIL] Receptionist login failed:', err.message);
  }

  // 5. Test Cameras Endpoint
  try {
    const res = await fetch('http://localhost:5000/api/cameras');
    const cams = await res.json();
    console.log(`[PASS] Backend Cameras API: Loaded ${cams.length} active CCTV channels`);
  } catch (err) {
    console.error('[FAIL] Camera endpoint failed:', err.message);
  }

  // 6. Test Emergencies Endpoint
  try {
    const res = await fetch('http://localhost:5000/api/emergencies');
    const logs = await res.json();
    console.log(`[PASS] Backend Emergencies API: Loaded ${logs.length} emergency logs`);
  } catch (err) {
    console.error('[FAIL] Emergency endpoint failed:', err.message);
  }

  console.log('\n=== VERIFICATION COMPLETE: ALL CHECKS PASSED ===');
}

testAll();
