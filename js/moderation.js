// 띄우기 전 글귀 검사 (클라이언트). 걸리면 저장하지 않는다.
// 아래 목록은 직접 추가·수정해도 된다. 띄어쓰기·기호·숫자를 끼워 넣은 변형도 함께 잡는다.

// 욕설·비하어. 자음만 쓴 변형도 여기에 넣는다.
export const BANNED_WORDS = [
  '시발', '씨발', '씨빨', '씨바', '쓰발', '시팔', '씨팔', '십팔', 'ㅅㅂ', 'ㅆㅂ', 'ㅅ ㅂ',
  '병신', '븅신', '빙신', 'ㅂㅅ', 'ㅄ',
  '개새끼', '개새기', '개색기', '개색끼', 'ㄱㅅㄲ', '새끼', 'ㅅㄲ',
  '좆', 'ㅈ같', '좃같', '존나', '졸라', 'ㅈㄴ',
  '지랄', 'ㅈㄹ', '썅', '쌍놈', '쌍년', '미친놈', '미친년', 'ㅁㅊ', '또라이', '닥쳐',
  '애미', '애비', '느금', '니미', '니애미', '엠창', '앰창',
  '한남충', '김치녀', '된장녀', '틀딱', '급식충', '맘충', '짱깨', '쪽바리', '흑형',
  '장애새끼', '애자', '정신병자',
  'fuck', 'shit', 'bitch', 'asshole', 'motherfucker',
];

// 위기 문구. 걸리면 공개하지 않고 도움 안내를 보여 준다.
export const CRISIS_WORDS = [
  '자살', '자해', '죽고싶', '죽고 싶', '죽어버리고싶', '죽고만싶',
  '사라지고싶', '사라지고 싶', '살기싫', '살고싶지않', '살고 싶지 않',
  '극단적선택', '손목긋', '뛰어내리고싶', '목매', '삶을끝내', '다끝내고싶',
];

// SNS·메신저 이름 (+ 아이디처럼 보이는 문자열이 붙으면 차단)
const SNS = '(?:카톡|카카오톡|카카오|오픈채팅|오픈톡|인스타그램|인스타|insta|instagram|ig|dm|디엠|텔레그램|텔레|telegram|라인|line|트위터|twitter|엑스|페북|페이스북|facebook|틱톡|tiktok|디코|디스코드|discord|아이디|id)';

const MESSAGES = {
  empty: '한 글자 이상 써 주세요',
  long: '100자까지 쓸 수 있어요',
  repeat: '같은 글자를 너무 많이 반복했어요',
  contact: '연락처나 링크는 바다에 띄울 수 없어요',
  sns: '연락처나 SNS 아이디는 바다에 띄울 수 없어요',
  banned: '바다에 띄우기 어려운 표현이 있어요. 조금만 고쳐 볼까요?',
};

// 글자 사이에 끼운 띄어쓰기·기호·숫자를 지운 형태 (예: "시 1 발" → "시발")
function squash(text) {
  return text.toLowerCase().replace(/[\s\d._\-~!?*@#$%^&+=|/\\,'"`·ㆍ…()[\]{}<>]/g, '');
}

function hasContact(text) {
  const t = text.toLowerCase();
  // 휴대폰 번호: 010 1234 5678, 010-1234-5678, 010.1234.5678, 공일공 등
  const KOR_DIGIT = { 공: '0', 영: '0', 일: '1', 이: '2', 삼: '3', 사: '4', 오: '5', 육: '6', 칠: '7', 팔: '8', 구: '9' };
  const digits = t
    .replace(/공\s*일\s*[공일육칠팔구]/g, (m) => m.replace(/\s/g, '').split('').map((c) => KOR_DIGIT[c]).join(''))
    .replace(/[\s.\-()]/g, '');
  if (/01[016789]\d{7,8}/.test(digits)) return 'contact';
  // 이메일
  if (/[\w.+-]+\s*(?:@|골뱅이)\s*[\w-]+\s*\.\s*[a-z]{2,}/i.test(t)) return 'contact';
  // 링크
  if (/https?:\/\/|www\.|open\.kakao|bit\.ly|닷컴|닷넷/i.test(t)) return 'contact';
  if (/[a-z0-9-]+\s*\.\s*(?:com|net|org|kr|co|io|me|ly|gg|xyz|app|link|site|shop|kakao)\b/i.test(t)) return 'contact';
  // @아이디
  if (/@[a-z0-9._]{2,}/i.test(t)) return 'sns';
  // SNS 이름 + 아이디처럼 보이는 문자열
  if (new RegExp(`(?:^|[^a-z])${SNS}\\s*[:：은는이가을를]?\\s*@?[a-z][a-z0-9._]{2,}`, 'i').test(t)) return 'sns';
  if (/오픈채팅|오픈톡|갠톡|개인톡|맞팔/.test(t)) return 'sns';
  return null;
}

export function checkText(raw) {
  const text = (raw || '').trim();
  if (!text) return { ok: false, reason: MESSAGES.empty };
  if (text.length > 100) return { ok: false, reason: MESSAGES.long };

  const flat = squash(text);
  // 위기 문구는 다른 검사보다 먼저 본다
  if (CRISIS_WORDS.some((w) => flat.includes(squash(w)))) return { ok: false, crisis: true };

  const contact = hasContact(text);
  if (contact) return { ok: false, reason: MESSAGES[contact] };

  if (BANNED_WORDS.some((w) => flat.includes(squash(w)))) return { ok: false, reason: MESSAGES.banned };

  if (/(.)\1{9,}/u.test(text.replace(/\s/g, ''))) return { ok: false, reason: MESSAGES.repeat };

  return { ok: true, text };
}
