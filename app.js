// ════════════════════════════════════════════
// 1. Firebase 初期化
// ════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "__FIREBASE_API_KEY__",
  authDomain:        "__FIREBASE_AUTH_DOMAIN__",
  projectId:         "__FIREBASE_PROJECT_ID__",
  storageBucket:     "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId:             "__FIREBASE_APP_ID__"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const EMAIL_SIGNIN_KEY = "emailForSignIn";
const RECENT_EMAIL_KEY = "recentLoginEmail";

// ════════════════════════════════════════════
// 2. 許可ドメイン
// ════════════════════════════════════════════
const ALLOWED_DOMAIN_REGEX = /@([a-zA-Z0-9-]+\.)*waseda\.jp$/i;

// ════════════════════════════════════════════
// 3. UI ヘルパー
// ════════════════════════════════════════════
const show = id => document.getElementById(id).classList.remove("hidden");
const hide = id => document.getElementById(id).classList.add("hidden");
const hideAll = () => ["sec-loading", "sec-login", "sec-email-sent", "sec-attend"].forEach(hide);
let pendingEmailResolver = null;

function getEmailInputValue() {
	const input = document.getElementById("email-input");
	if (!input) return "";
	return input.value.trim();
}

function closeEmailInputPanel(value) {
	const panel = document.getElementById("email-input-panel");
	const submit = document.getElementById("btn-email-submit");
	const cancel = document.getElementById("btn-email-cancel");
	if (panel) panel.classList.add("hidden");
	if (submit) submit.textContent = "続行";
	if (cancel) cancel.classList.remove("hidden");

	if (pendingEmailResolver) {
		const resolve = pendingEmailResolver;
		pendingEmailResolver = null;
		resolve(value);
	}
}

function requestEmailInput({ label, submitText = "続行", initialValue = "" }) {
	const panel = document.getElementById("email-input-panel");
	const labelEl = document.getElementById("email-input-label");
	const input = document.getElementById("email-input");
	const submit = document.getElementById("btn-email-submit");
	const cancel = document.getElementById("btn-email-cancel");

	if (!panel || !labelEl || !input || !submit || !cancel) {
		return Promise.resolve(null);
	}

	if (pendingEmailResolver) {
		closeEmailInputPanel(null);
	}

	labelEl.textContent = label;
	submit.textContent = submitText;
	input.value = initialValue;
	panel.classList.remove("hidden");
	globalThis.setTimeout(() => input.focus(), 0);

	return new Promise((resolve) => {
		pendingEmailResolver = resolve;
	});
}

function getRecentEmail() {
	const email = globalThis.localStorage.getItem(RECENT_EMAIL_KEY);
	if (!email || !ALLOWED_DOMAIN_REGEX.test(email)) return "";
	return email;
}

function renderRecentLoginButton() {
	const wrap = document.getElementById("recent-login-wrap");
	const btn = document.getElementById("btn-login-recent");
	if (!wrap || !btn) return;

	const email = getRecentEmail();
	if (!email) {
		wrap.classList.add("hidden");
		btn.textContent = "";
		return;
	}

	btn.textContent = `${email} でログイン`;
	wrap.classList.remove("hidden");
}

async function startEmailLinkSignIn(email) {
	if (!ALLOWED_DOMAIN_REGEX.test(email)) {
		showResult("login-result", "error", "⛔", "ドメインエラー",
			`waseda.jp のアドレスのみ利用可能です`);
		return;
	}

	const actionCodeSettings = {
		url: globalThis.location.href,
		handleCodeInApp: true
	};

	try {
		await auth.sendSignInLinkToEmail(email, actionCodeSettings);
		globalThis.localStorage.setItem(EMAIL_SIGNIN_KEY, email);
		globalThis.localStorage.setItem(RECENT_EMAIL_KEY, email);
		renderRecentLoginButton();
		hideAll();
		show("sec-email-sent");
		document.getElementById("sent-email-display").textContent = email;
	} catch (e) {
		showResult("login-result", "error", "❌", "送信エラー", e.message);
	}
}

function showResult(elId, type, icon, title, detail) {
	const el = document.getElementById(elId);
	el.className = `result show ${type}`;
	const div1 = document.createElement("div");
	const div2 = document.createElement("div");
	const div3 = document.createElement("div");
	div1.className = "result-icon";
	div2.className = "result-title";
	div3.className = "result-detail";
	div1.textContent = icon;
	div2.textContent = title;
	div3.textContent = detail;
	el.append(div1, div2, div3);
}

// ════════════════════════════════════════════
// 4. URLパラメータ取得
// ════════════════════════════════════════════
function getUrlParams() {
	const p = new URLSearchParams(globalThis.location.search);
	return { otp: p.get("otp"), sessionId: p.get("sid") };
}

// ════════════════════════════════════════════
// 5. メールリンク認証処理
// ════════════════════════════════════════════
async function handleEmailLink() {
	if (!auth.isSignInWithEmailLink(globalThis.location.href)) return false;

	let email = globalThis.localStorage.getItem(EMAIL_SIGNIN_KEY);
	if (!email) {
		hideAll();
		show("sec-login");
		renderRecentLoginButton();
		email = await requestEmailInput({
			label: "確認のためメールアドレスを入力してください",
			submitText: "認証を続行",
			initialValue: getRecentEmail()
		});
	}
	if (!email) return false;

	if (ALLOWED_DOMAIN_REGEX.test(email)) {
		globalThis.localStorage.setItem(RECENT_EMAIL_KEY, email);
		renderRecentLoginButton();
	}

	try {
		await auth.signInWithEmailLink(email, globalThis.location.href);
		globalThis.localStorage.removeItem(EMAIL_SIGNIN_KEY);
		// URLをクリーンに
		history.replaceState(null, "", globalThis.location.pathname + globalThis.location.search.replaceAll(/[?&]?(apiKey|oobCode|mode|lang)=[^&]*/, "").replace(/^&/, "?"));
		return true;
	} catch (e) {
		console.error("signInWithEmailLink error:", e);
		return false;
	}
}

// ════════════════════════════════════════════
// 6. ログインボタン
// ════════════════════════════════════════════
document.getElementById("btn-login").addEventListener("click", async () => {
	const email = await requestEmailInput({
		label: "大学メールアドレスを入力してください（例: student@fuji.waseda.jp）",
		submitText: "ログインメールを送信",
		initialValue: getRecentEmail()
	});
	if (!email) return;
	await startEmailLinkSignIn(email);
});

document.getElementById("btn-login-recent").addEventListener("click", async () => {
	const email = getRecentEmail();
	if (!email) {
		renderRecentLoginButton();
		return;
	}
	await startEmailLinkSignIn(email);
});

document.getElementById("btn-email-submit").addEventListener("click", () => {
	const email = getEmailInputValue();
	if (!email) return;
	closeEmailInputPanel(email);
});

document.getElementById("btn-email-cancel").addEventListener("click", () => {
	closeEmailInputPanel(null);
});

document.getElementById("email-input").addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		const email = getEmailInputValue();
		if (!email) return;
		closeEmailInputPanel(email);
		return;
	}

	if (e.key === "Escape") {
		e.preventDefault();
		closeEmailInputPanel(null);
	}
});

// ════════════════════════════════════════════
// 7. ログアウト
// ════════════════════════════════════════════
document.getElementById("btn-logout").addEventListener("click", async () => {
	await auth.signOut();
});

// ════════════════════════════════════════════
// 8. 出席ボタン
// ════════════════════════════════════════════
document.getElementById("btn-attend").addEventListener("click", async () => {
	const btn = document.getElementById("btn-attend");
	btn.disabled = true;
	btn.innerHTML = `<span class="spinner"></span> 処理中...`;

	const { otp, sessionId } = getUrlParams();
	const user = auth.currentUser;

	try {
		await recordAttendance(db, user, otp, sessionId);
		showResult("attend-result", "success", "✅", "出席を記録しました",
			`Session: ${sessionId} (${new Date().toLocaleString("ja-JP")})`);
		btn.innerHTML = "出席済み";
	} catch (e) {
		const msg = friendlyError(e.message);
		showResult("attend-result", "error", "❌", msg.title, msg.detail);
		btn.disabled = false;
		btn.innerHTML = "出席を記録する";
	}
});

// ════════════════════════════════════════════
// 9. Firestore トランザクション（出席記録）
// ════════════════════════════════════════════
async function recordAttendance(db, user, otp, sessionId) {
	if (!otp || !sessionId) throw new Error("INVALID_PARAMS");

	// 先にOTPドキュメントを1件特定（トランザクション内ではdoc参照のみ扱う）
	const otpQuery = db.collection("otps")
		.where("code", "==", otp)
		.where("sessionId", "==", sessionId)
		.limit(1);
	const otpQuerySnap = await otpQuery.get();
	if (otpQuerySnap.empty) throw new Error("OTP_NOT_FOUND");

	const otpDocRef = otpQuerySnap.docs[0].ref;
	const attendRef = db.collection("attendance").doc(`${user.uid}_${sessionId}`);

	await db.runTransaction(async (tx) => {
		const otpDoc = await tx.get(otpDocRef);
		if (!otpDoc.exists) throw new Error("OTP_NOT_FOUND");
		const otpData = otpDoc.data();

		if (!otpData) throw new Error("OTP_NOT_FOUND");
		if (otpData.used) throw new Error("OTP_ALREADY_USED");
		if (otpData.sessionId !== sessionId) throw new Error("SESSION_MISMATCH");

		// 同一ユーザの重複出席チェック（uid+sessionIdの固定IDで判定）
		const attendSnap = await tx.get(attendRef);
		if (attendSnap.exists) throw new Error("ALREADY_ATTENDED");

		// OTPを使用済みに更新
		tx.update(otpDocRef, {
			used: true,
			usedBy: user.uid
		});

		// 出席記録を追加
		tx.set(attendRef, {
			uid: user.uid,
			email: user.email,
			sessionId: sessionId,
			timestamp: firebase.firestore.FieldValue.serverTimestamp()
		});
	});
}

// ════════════════════════════════════════════
// 10. エラーメッセージ変換
// ════════════════════════════════════════════
function friendlyError(code) {
	const map = {
		OTP_NOT_FOUND: { title: "無効なQRコード", detail: "OTPが存在しません。正しいQRコードを読み取ってください。" },
		OTP_ALREADY_USED: { title: "使用済みのQRコード", detail: "このOTPはすでに使用されています。" },
		SESSION_MISMATCH: { title: "セッション不一致", detail: "QRコードとセッションIDが一致しません。" },
		ALREADY_ATTENDED: { title: "出席済みです", detail: "このセッションへの出席はすでに記録されています。" },
		INVALID_PARAMS: { title: "パラメータ不足", detail: "URLにotp・sessionIdが含まれていません。" },
	};
	return map[code] || { title: "エラーが発生しました", detail: code };
}

// ════════════════════════════════════════════
// 11. 認証状態の監視
// ════════════════════════════════════════════
// onAuthStateChanged は先に登録して、初期表示の待ち時間を短くする
(async () => {
	let authResolved = false;
	const isEmailLink = auth.isSignInWithEmailLink(globalThis.location.href);

	// 通常アクセス時、認証状態の復元が遅い場合は先にログインUIを見せる
	const fallbackTimer = globalThis.setTimeout(() => {
		if (!authResolved && !isEmailLink) {
			hideAll();
			show("sec-login");
		}
	}, 1200);

	auth.onAuthStateChanged(async (user) => {
		authResolved = true;
		globalThis.clearTimeout(fallbackTimer);
		hideAll();
		renderRecentLoginButton();

		if (!user) {
			show("sec-login");
			return;
		}

		// ドメインチェック（二重チェック）
		if (!ALLOWED_DOMAIN_REGEX.test(user.email || "")) {
			await auth.signOut();
			show("sec-login");
			showResult("login-result", "error", "⛔", "ドメインエラー",
				`waseda.jp のアドレスのみ利用可能です`);
			return;
		}

		show("sec-attend");
		document.getElementById("display-email").textContent = user.email;
		if (user.email && ALLOWED_DOMAIN_REGEX.test(user.email)) {
			globalThis.localStorage.setItem(RECENT_EMAIL_KEY, user.email);
			renderRecentLoginButton();
		}

		const { otp, sessionId } = getUrlParams();
		if (otp && sessionId) {
			show("session-panel");
			hide("no-session-panel");
			document.getElementById("display-session").textContent = sessionId;
			document.getElementById("display-otp").textContent = otp;
		} else {
			show("no-session-panel");
			hide("session-panel");
		}
	});

	// メールリンク処理は監視登録後に実行
	if (isEmailLink) {
		await handleEmailLink();
	}
})();
