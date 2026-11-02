// 띄우기 전 글귀 검사. 걸리면 저장하지 않는다.
// 지금은 기본 규칙만 있다. 연락처·링크·욕설·위기 문구 검사는 작업 순서 7단계에서 붙인다.

export function checkText(raw) {
  const text = (raw || '').trim();
  if (!text) return { ok: false, reason: '한 글자 이상 써 주세요' };
  if (text.length > 100) return { ok: false, reason: '100자까지 쓸 수 있어요' };
  if (/(.)\1{9,}/u.test(text.replace(/\s/g, ''))) {
    return { ok: false, reason: '같은 글자를 너무 많이 반복했어요' };
  }
  return { ok: true, text };
}
