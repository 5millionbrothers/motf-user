(function exposeIdentityFlow(root) {
  function waitForResult({ popup, origin, getStatus, submit, timeoutMs = 600000, pollMs = 1500, closeGraceMs = 10000 }) {
    return new Promise((resolve, reject) => {
      let finished = false, checking = false, closedAt = null, lastError = null;
      const interval = root.setInterval(check, pollMs);
      const timeout = root.setTimeout(() => finish(new Error('본인인증 시간이 만료되었습니다. 다시 시도해주세요.')), timeoutMs);
      function finish(error, result) {
        if (finished) return;
        finished = true;
        root.clearInterval(interval);
        root.clearTimeout(timeout);
        root.removeEventListener('message', onMessage);
        if (error) reject(error); else resolve(result);
      }
      async function check() {
        if (finished || checking) return;
        checking = true;
        if (popup.closed && closedAt === null) closedAt = Date.now();
        try {
          const status = await getStatus();
          if (finished) return;
          if (status.verified === true) {
            if (!status.person?.name || !status.person?.phone || !status.person?.birthDate) {
              finish(new Error('본인인증 결과의 필수 정보를 확인하지 못했습니다. 다시 인증해주세요.'));
            } else finish(null, status);
            return;
          }
          lastError = null;
        } catch (error) {
          lastError = error;
          if ([400, 401, 403, 404, 410].includes(error.status)) finish(error);
        } finally { checking = false; }
        // A callback may close the popup before its message reaches the opener.
        if (!finished && closedAt !== null && Date.now() - closedAt >= closeGraceMs) {
          finish(lastError || new Error('본인인증 창이 닫혔습니다. 인증이 완료되지 않았다면 다시 시도해주세요.'));
        }
      }
      async function onMessage(event) {
        if (event.origin !== origin || event.source !== popup || event.data?.type !== 'motf:kcp-identity' || finished) return;
        if (event.data.ok === true) { await check(); return; }
        await check();
        if (!finished) finish(new Error(event.data.message || '본인인증이 취소되었거나 실패했습니다.'));
      }
      root.addEventListener('message', onMessage);
      try { submit(); } catch (error) { finish(error); }
    });
  }
  root.MotfIdentityFlow = { waitForResult };
})(typeof window === 'undefined' ? globalThis : window);
