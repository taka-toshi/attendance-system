// ════════════════════════════════════════════
// 1. Firebase 初期化
// ════════════════════════════════════════════
const firebaseConfig = {
	apiKey: "AIzaSyCluE4MbrOdkFVyzkCcc17c4QFLVXC2HDQ",
	authDomain: "attendance-system-c41d8.firebaseapp.com",
	projectId: "attendance-system-c41d8",
	storageBucket: "attendance-system-c41d8.firebasestorage.app",
	messagingSenderId: "662073311348",
	appId: "1:662073311348:web:a38383667c6df66c861121"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ════════════════════════════════════════════
// 2. 許可ドメイン
// ════════════════════════════════════════════
const ALLOWED_DOMAIN = "waseda.jp";

// ════════════════════════════════════════════
// 3. UI ヘルパー
// ════════════════════════════════════════════
const show = id => document.getElementById(id).classList.remove("hidden");
const hide = id => document.getElementById(id).classList.add("hidden");
const hideAll = () => ["sec-loading", "sec-login", "sec-email-sent", "sec-attend"].forEach(hide);

function showResult(elId, type, icon, title, detail) {
	const el = document.getElementById(elId);
	el.className = `result show ${type}`;
	el.innerHTML = `
		<div class="result-icon">${icon}</div>
		<div class="result-title">${title}</div>
		${detail ? `<div class="result-detail">${detail}</div>` : ""}
	`;
}

// ════════════════════════════════════════════
// 4. URLパラメータ取得
// ════════════════════════════════════════════
function getUrlParams() {
	const p = new URLSearchParams(window.location.search);
	return { otp: p.get("otp"), sessionId: p.get("sessionId") };
}

// ════════════════════════════════════════════
// 5. メールリンク認証処理
// ════════════════════════════════════════════
async function handleEmailLink() {
	if (!auth.isSignInWithEmailLink(window.location.href)) return false;

	let email = window.localStorage.getItem("emailForSignIn");
	if (!email) {
		email = window.prompt("確認のためメールアドレスを入力してください");
	}
	if (!email) return false;

	try {
		await auth.signInWithEmailLink(email, window.location.href);
		window.localStorage.removeItem("emailForSignIn");
		// URLをクリーンに
		history.replaceState(null, "", window.location.pathname + window.location.search.replace(/[?&]?(apiKey|oobCode|mode|lang)=[^&]*/g, "").replace(/^&/, "?"));
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
	const email = prompt("大学メールアドレスを入力してください（例: student@fuji.waseda.jp）");
	if (!email) return;

	if (!email.endsWith(ALLOWED_DOMAIN)) {
		showResult("login-result", "error", "⛔", "ドメインエラー",
			`waseda.jp のアドレスのみ利用可能です`);
		return;
	}

	const actionCodeSettings = {
		url: window.location.href,
		handleCodeInApp: true
	};

	try {
		await auth.sendSignInLinkToEmail(email, actionCodeSettings);
		window.localStorage.setItem("emailForSignIn", email);
		hideAll();
		show("sec-email-sent");
		document.getElementById("sent-email-display").textContent = email;
	} catch (e) {
		showResult("login-result", "error", "❌", "送信エラー", e.message);
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
			`Session: ${sessionId} | ${new Date().toLocaleString("ja-JP")}`);
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
// まずメールリンク処理（ページ読み込み時）
(async () => {
	const handled = await handleEmailLink();
	if (handled) return; // onAuthStateChanged が続けて動く

	auth.onAuthStateChanged(async (user) => {
		hideAll();

		if (!user) {
			show("sec-login");
			return;
		}

		// ドメインチェック（二重チェック）
		if (!user.email.endsWith(ALLOWED_DOMAIN)) {
			await auth.signOut();
			show("sec-login");
			showResult("login-result", "error", "⛔", "ドメインエラー",
				`waseda.jp のアドレスのみ利用可能です`);
			return;
		}

		show("sec-attend");
		document.getElementById("display-email").textContent = user.email;

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
})();
