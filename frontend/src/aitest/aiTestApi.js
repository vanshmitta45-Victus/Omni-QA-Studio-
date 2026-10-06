import api from '../api/client';

// JWT-aware wrapper around merged /api/ai-test/* endpoints.
// Uses the shared axios client so Authorization + 401 handling apply.
export async function checkAiTestStatus() {
  try {
    const res = await api.get('/ai-test/health', { timeout: 4000 });
    return { online: true, status: res.status, data: res.data };
  } catch (error) {
    return { online: false, status: error?.response?.status, error: error.message };
  }
}

export async function generateSeleniumTest(url, instruction) {
  try {
    const res = await api.post('/ai-test/generate', { url, instruction }, { responseType: 'text' });
    return { success: true, code: typeof res.data === 'string' ? res.data : String(res.data ?? '') };
  } catch (error) {
    const msg = error?.response?.data || error.message;
    return { success: false, error: typeof msg === 'string' ? msg : error.message };
  }
}

export async function healBrokenLocator(failedLocator, currentDom) {
  try {
    const res = await api.post('/ai-test/heal', { failedLocator, currentDom }, { responseType: 'text' });
    return { success: true, healedLocator: typeof res.data === 'string' ? res.data : String(res.data ?? '') };
  } catch (error) {
    const msg = error?.response?.data || error.message;
    return { success: false, error: typeof msg === 'string' ? msg : error.message };
  }
}

export async function executeTestInSandbox(javaCode, className) {
  try {
    const res = await api.post('/ai-test/execute', { javaCode, className }, { responseType: 'text' });
    return { success: true, result: typeof res.data === 'string' ? res.data : String(res.data ?? '') };
  } catch (error) {
    const msg = error?.response?.data || error.message;
    return { success: false, error: typeof msg === 'string' ? msg : error.message };
  }
}

export async function fixBrokenCode(javaCode, errorMessage) {
  try {
    const res = await api.post('/ai-test/fix', { javaCode, errorMessage }, { responseType: 'text' });
    return { success: true, fixedCode: typeof res.data === 'string' ? res.data : String(res.data ?? '') };
  } catch (error) {
    const msg = error?.response?.data || error.message;
    return { success: false, error: typeof msg === 'string' ? msg : error.message };
  }
}
