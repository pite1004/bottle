# 유리병 편지 (bottle)

carbon footprint viral contents. bottle message fishing

지구온난화로 도시가 물에 잠긴 2100년. 1인칭으로 바다를 바라보며 떠다니는 유리병을 낚싯대로 건져 낯선 사람의 한 줄을 읽고, 나도 병을 꾸며 바다에 띄우는 웹 서비스예요.

- 사이트: https://bottle-hazel.vercel.app
- 작업 지시서(기획·명세): [CLAUDE.md](CLAUDE.md)

이 문서는 개발이 처음인 사람도 따라 할 수 있게 썼어요.

---

## 1. 어떻게 돌아가나요

| 부분 | 하는 일 |
| --- | --- |
| **GitHub** (`pite1004/bottle`) | 코드를 보관하는 곳 |
| **Vercel** | GitHub에 새 코드가 올라오면(push) 1분 안에 사이트를 자동으로 다시 배포 |
| **Firebase** (`bottle-df5bb`) | 익명 로그인 + 병 데이터 저장(Firestore, 서울) |

빌드 과정이 없는 정적 사이트예요. npm 설치 같은 건 필요 없어요.

## 2. 파일 안내

```
index.html            화면 전체 뼈대 (모든 화면이 섹션으로 들어 있음)
style.css             색·글꼴·배치
firebase-config.js    Firebase 웹 앱 설정값 (비우면 체험 모드)
firestore.rules       Firestore 보안 규칙 (콘솔에 붙여 넣는 원본)
js/app.js             화면 전환, 버튼 동작
js/intro.js           처음 들어올 때 보여 주는 인트로 (상단 바 ⋯ 메뉴에서 다시 보기)
js/sea.js             바다 그리기, 병 움직임, 낚시
js/bottle.js          병·쓰레기 그림(SVG), 꾸미기 선택지
js/store.js           Firebase / 체험 모드 저장
js/moderation.js      띄우기 전 글 검사 (금칙어 목록)
js/sound.js           바닷소리 (파일 없이 합성)
js/card.js            공유 카드 이미지
```

## 3. 자주 하게 될 일

### 금칙어 추가하기
1. GitHub에서 [js/moderation.js](js/moderation.js)를 열고 오른쪽 위 연필 아이콘(Edit)을 눌러요.
2. 맨 위 `BANNED_WORDS` 목록에 `'단어',` 형태로 추가해요. 띄어쓰기·숫자를 끼운 변형은 자동으로 같이 잡혀요.
3. 위기 문구는 그 아래 `CRISIS_WORDS`에 같은 방식으로 추가해요.
4. 오른쪽 위 **Commit changes…** → **Commit changes**를 누르면 1분 뒤 사이트에 반영돼요.

### 문제 있는 병 지우기
신고가 3번 쌓이면 자동으로 숨겨지지만, 바로 지우고 싶을 때:
1. [Firebase 콘솔](https://console.firebase.google.com) → `bottle` 프로젝트
2. 왼쪽 **데이터베이스 및 스토리지 → Firestore** → **데이터** 탭 → `bottles`
3. 지울 문서를 누르고 오른쪽 점 세 개(⋮) → **문서 삭제**

숨기기만 하려면 문서의 `hidden` 값을 `true`로 바꿔요.

### 배포가 잘 됐는지 보기
[Vercel 대시보드](https://vercel.com/pite1004/bottle) → **Deployments**에서 맨 위가 **Ready**면 성공이에요. **Error**면 눌러서 로그를 확인해요.

## 4. 확인용 주소

주소 끝에 붙여서 쓰는 확인용 옵션이에요.

| 주소 | 보이는 것 |
| --- | --- |
| `?time=day` / `?time=dusk` / `?time=night` | 낮 / 노을 / 밤 하늘 (원래는 기기 시각 기준) |
| `?empty=1` | 병 없는 빈 바다 (쓰레기만 떠다님) |

예: `https://bottle-hazel.vercel.app/?time=night`

## 5. 처음부터 다시 설정할 때

이미 다 되어 있어요. 새 Firebase 프로젝트로 옮기거나 처음부터 다시 만들 때만 보세요.

### 5-1. Firebase
1. [Firebase 콘솔](https://console.firebase.google.com)에서 **프로젝트 만들기** → 이름 `bottle` → Google 애널리틱스 **사용 안 함**
2. 프로젝트 첫 화면 **`</>`(웹)** → 닉네임 `bottle-web` → Firebase 호스팅 체크 **안 함** → **앱 등록**
3. 나오는 `firebaseConfig` 값을 [firebase-config.js](firebase-config.js)에 붙여 넣어요.
   (나중에 다시 보려면: **설정(톱니바퀴) → 프로젝트 설정 → 내 앱 → SDK 설정 및 구성 → 구성**)
4. 왼쪽 **보안 → Authentication** → **시작하기** → **로그인 방법** → **익명** → 사용 설정 → **저장**
5. 왼쪽 **데이터베이스 및 스토리지 → Firestore** → **데이터베이스 만들기** → Standard → 위치 **asia-northeast3 (Seoul)** → **프로덕션 모드**
6. Firestore **규칙** 탭 → 내용을 지우고 [firestore.rules](firestore.rules) 전체를 붙여 넣기 → **게시**

Firebase 웹 설정값(apiKey 등)은 원래 공개되는 값이라 저장소에 올려도 괜찮아요. 보안은 6번의 규칙이 지켜요. 그 밖의 비밀 키는 절대 저장소에 올리지 않아요.

### 5-2. Vercel
1. [vercel.com/new](https://vercel.com/new) → 팀 `pite1004` 확인
2. GitHub 계정 목록에서 `pite1004`가 없으면 **Add GitHub Account** → 저장소 `bottle`만 허용 → **Install**
3. `bottle` 옆 **Import** → Framework Preset **Other** → 나머지 그대로 → **Deploy**

### 5-3. 체험 모드
[firebase-config.js](firebase-config.js)의 값을 비우면(`export const firebaseConfig = {};`) Firebase 없이 이 기기 안에서만 동작하는 체험 모드가 돼요. 화면 구석에 `체험 모드`가 표시되고 `(예시)`가 붙은 예시 병이 떠다녀요. 실제 사이트에는 예시 병을 넣지 않아요.

## 6. 내 컴퓨터에서 미리 보기 (선택)

파일을 바로 더블클릭하면 동작하지 않아요(모듈 보안 정책). 프로젝트 폴더에서 아래 명령을 실행한 뒤 브라우저에서 `http://localhost:5173`을 열어요. (Python이 설치되어 있어야 해요)

```bash
python -m http.server 5173
```

## 7. 알려진 한계

- **보관함은 이 기기에만** 저장돼요. 브라우저 데이터를 지우면 건진 편지·수집품이 사라지고, 익명 계정이 새로 만들어져 예전에 띄운 병도 보관함에서 안 보여요(병 자체는 바다에 남아요).
- **같은 사람이 건진 수·신고 수를 여러 번 올릴 수 있어요.** 나중에 App Check나 사용자별 기록으로 보완할 예정이에요.
- **글 검사는 브라우저에서만** 해요. 목록에 없는 표현이나 교묘한 변형은 통과할 수 있어서, 신고와 콘솔 삭제로 보완해요.
- **아이폰 무음 스위치**가 켜져 있으면 바닷소리가 안 나요.
- **카드 이미지는 갤러리에 직접 저장할 수 없어요**(웹페이지 보안 정책). 안드로이드는 Download 폴더에 저장되고 갤러리 앱의 Download 앨범에서 보여요. 아이폰은 공유 시트의 **이미지 저장**을 누르면 사진 앱에 들어가요.
- 알림 메일, Google·이메일 로그인, 관리자 페이지는 이번 범위 밖이에요.
