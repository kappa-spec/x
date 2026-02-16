let _supabase;
let me = null;
let posts = [];
let users = {};
let currentViewUser = "me";
let currentTab = "posts";
let authMode = "login";

/**
 * 本家風エラー・通知表示 (Toast)
 */
function showError(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    // 3秒後に非表示
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * アプリ初期化
 */
async function initApp() {
    try {
        // 1. サーバーからSupabase接続情報を取得
        const res = await fetch('/api/config');
        const config = await res.json();
        
        if (!config.supabaseUrl || !config.supabaseKey) {
            showError("設定が見つかりません。envファイルを確認してください。");
            return;
        }

        // 2. Supabaseクライアント初期化
        _supabase = supabase.createClient(config.supabaseUrl, config.supabaseKey);

        // 3. ログイン状態の確認
        const { data: { user } } = await _supabase.auth.getUser();
        if (user) {
            const { data: profile, error } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
            if (profile) {
                me = { ...profile, name: profile.display_name };
                showApp();
            } else {
                // プロフィールがない場合はログアウト処理
                await _supabase.auth.signOut();
            }
        }
    } catch (e) {
        showError("初期化に失敗しました。再読み込みしてください。");
    }
}

/**
 * 認証画面の切り替え
 */
function switchAuthMode(mode) {
    authMode = mode;
    const nameField = document.getElementById('auth-name');
    const submitBtn = document.getElementById('auth-submit-btn');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');

    if (mode === 'signup') {
        nameField.classList.remove('hidden');
        submitBtn.innerText = "新規登録";
        tabSignup.className = "flex-1 py-2 font-bold active-tab";
        tabLogin.className = "flex-1 py-2 font-bold text-[#71767b]";
    } else {
        nameField.classList.add('hidden');
        submitBtn.innerText = "ログイン";
        tabLogin.className = "flex-1 py-2 font-bold active-tab";
        tabSignup.className = "flex-1 py-2 font-bold text-[#71767b]";
    }
}

/**
 * 認証実行 (メールアドレス不要ロジック)
 */
async function handleAuth() {
    const handle = document.getElementById('auth-handle').value.toLowerCase().replace('@', '').trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const name = document.getElementById('auth-name').value.trim();

    if (!handle || !pass) {
        return showError("ユーザー名とパスワードを入力してください");
    }

    // 内部的に使用するダミーメールアドレス
    const dummyEmail = `${handle}@x-clone-dummy.com`;

    if (authMode === 'signup') {
        if (!name) return showError("名前を入力してください");
        
        const { data, error } = await _supabase.auth.signUp({
            email: dummyEmail,
            password: pass
        });

        if (error) {
            return showError("登録に失敗しました: " + error.message);
        }

        // 成功したらprofilesテーブルにユーザー情報を追加
        const { error: profileError } = await _supabase.from('profiles').insert([{
            id: data.user.id,
            handle: handle,
            display_name: name,
            bio: "よろしくお願いします。",
            following: [],
            followers: []
        }]);

        if (profileError) {
            return showError("プロフィール作成に失敗しました");
        }

        location.reload();
    } else {
        // ログイン
        const { error } = await _supabase.auth.signInWithPassword({
            email: dummyEmail,
            password: pass
        });

        if (error) {
            return showError("ユーザー名またはパスワードが正しくありません");
        }
        
        location.reload();
    }
}

/**
 * アプリ画面の表示
 */
function showApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('side-name').innerText = me.name;
    fetchData();
}

/**
 * ログアウト
 */
async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

/**
 * データの同期取得
 */
async function fetchData() {
    // 投稿の取得
    const { data: pData } = await _supabase.from('posts').select('*').order('created_at', { ascending: false });
    posts = pData || [];

    // 全ユーザーのプロフィール取得（簡易的なハッシュマップ作成）
    const { data: uData } = await _supabase.from('profiles').select('*');
    users = (uData || []).reduce((acc, u) => ({
        ...acc,
        [u.handle]: { ...u, name: u.display_name }
    }), {});

    refreshCurrentView();
    renderSuggestions();
}

/**
 * 投稿の実行
 */
async function submitPost() {
    const input = document.getElementById('post-input');
    const content = input.value.trim();
    if (!content) return;

    const { error } = await _supabase.from('posts').insert([{
        user_id: me.id,
        handle: me.handle,
        name: me.name,
        content: content,
        likes: [],
        reposts: [],
        replies: []
    }]);

    if (error) {
        showError("ポストの送信に失敗しました");
    } else {
        input.value = "";
        togglePostBtn('post-btn', 'post-input');
        fetchData();
    }
}

/**
 * 反応系 (いいね・リポスト)
 */
async function toggleLike(id) {
    const p = posts.find(x => x.id === id);
    const likes = p.likes || [];
    const newLikes = likes.includes(me.handle) 
        ? likes.filter(h => h !== me.handle) 
        : [...likes, me.handle];

    await _supabase.from('posts').update({ likes: newLikes }).eq('id', id);
    fetchData();
}

async function toggleRepost(id) {
    const p = posts.find(x => x.id === id);
    const reps = p.reposts || [];
    const newReps = reps.includes(me.handle) 
        ? reps.filter(h => h !== me.handle) 
        : [...reps, me.handle];

    await _supabase.from('posts').update({ reposts: newReps }).eq('id', id);
    fetchData();
}

/**
 * 返信の送信
 */
async function submitReply(postId) {
    const input = document.getElementById(`reply-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;

    const p = posts.find(x => x.id === postId);
    const newReply = {
        id: Date.now(),
        handle: me.handle,
        name: me.name,
        content: content
    };
    const updatedReplies = [...(p.replies || []), newReply];

    const { error } = await _supabase.from('posts').update({ replies: updatedReplies }).eq('id', postId);
    if (error) {
        showError("返信に失敗しました");
    } else {
        fetchData();
    }
}

/**
 * フォロー・フォロー解除
 */
async function toggleFollow(targetHandle) {
    const target = users[targetHandle];
    if (!target) return;

    let myFollowing = me.following || [];
    let targetFollowers = target.followers || [];

    if (myFollowing.includes(targetHandle)) {
        myFollowing = myFollowing.filter(h => h !== targetHandle);
        targetFollowers = targetFollowers.filter(h => h !== me.handle);
    } else {
        myFollowing.push(targetHandle);
        targetFollowers.push(me.handle);
    }

    await _supabase.from('profiles').update({ following: myFollowing }).eq('id', me.id);
    await _supabase.from('profiles').update({ followers: targetFollowers }).eq('id', target.id);
    
    me.following = myFollowing;
    fetchData();
}

/**
 * プロフィール編集の保存
 */
async function saveProfile() {
    const newName = document.getElementById('edit-name').value.trim();
    const newBio = document.getElementById('edit-bio').value.trim();
    
    if (!newName) return showError("名前は必須です");

    const { error } = await _supabase.from('profiles').update({ 
        display_name: newName, 
        bio: newBio 
    }).eq('id', me.id);

    if (error) {
        showError("保存に失敗しました");
    } else {
        me.name = newName;
        me.bio = newBio;
        toggleEditModal();
        fetchData();
    }
}

/**
 * ナビゲーション
 */
function nav(v, handle = "me") {
    const views = ['view-home', 'view-explore', 'view-profile'];
    views.forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('view-' + v).classList.remove('hidden');
    
    if (v === 'profile') { 
        currentViewUser = (handle === "me") ? me.handle : handle; 
        currentTab = 'posts'; 
        renderProfile(); 
    } else if (v === 'home') { 
        renderHome(); 
    } else if (v === 'explore') {
        renderSearch();
    }
    window.scrollTo(0, 0);
}

/**
 * HTML生成系
 */
function createPostHTML(p) {
    const isLiked = (p.likes || []).includes(me.handle);
    const isReposted = (p.reposts || []).includes(me.handle);
    const repliesCount = (p.replies || []).length;
    
    const repliesList = (p.replies || []).map(r => `
        <div class="pl-12 py-3 border-t x-border text-sm">
            <div class="font-bold">${r.name} <span class="font-normal text-[#71767b]">@${r.handle}</span></div>
            <div class="mt-1">${r.content}</div>
        </div>
    `).join('');

    return `
        <div class="border-b x-border">
            <div class="p-4 x-hover cursor-pointer" onclick="toggleReply(${p.id})">
                <div class="flex gap-3">
                    <div class="w-10 h-10 rounded-full bg-blue-600 shrink-0" onclick="event.stopPropagation(); nav('profile', '${p.handle}')"></div>
                    <div class="flex-1">
                        <div class="flex items-center gap-1 font-bold" onclick="event.stopPropagation(); nav('profile', '${p.handle}')">
                            ${p.name} <span class="font-normal text-[#71767b]">@${p.handle}</span>
                        </div>
                        <p class="mt-1 text-[15px] leading-normal whitespace-pre-wrap">${p.content}</p>
                        <div class="flex justify-between mt-3 text-[#71767b] max-w-[425px]">
                            <span class="flex items-center gap-2 hover:text-blue-400" onclick="event.stopPropagation(); toggleReply(${p.id})">
                                <svg viewBox="0 0 24 24" class="icon-sm"><path d="M1.751 10c0-4.42 3.584-8 8.001-8s8.001 3.58 8.001 8c0 4.42-3.584 8-8.001 8s-8.001-3.58-8.001-8zM10 4a6 6 0 100 12 6 6 0 000-12z"/></svg> ${repliesCount}
                            </span>
                            <span onclick="event.stopPropagation(); toggleRepost(${p.id})" class="flex items-center gap-2 hover:text-green-500 ${isReposted ? 'text-green-500' : ''}">
                                <svg viewBox="0 0 24 24" class="icon-sm"><path d="M4.5 3.88l4.432 4.43-1.06 1.06L5.25 6.75v6.75a7.5 7.5 0 0015 0h1.5a9 9 0 11-18 0V6.75L1.128 9.37l-1.06-1.06L4.5 3.88z"/></svg> ${p.reposts.length}
                            </span>
                            <span onclick="event.stopPropagation(); toggleLike(${p.id})" class="flex items-center gap-2 hover:text-pink-500 ${isLiked ? 'text-pink-500' : ''}">
                                <svg viewBox="0 0 24 24" class="icon-sm" style="fill:${isLiked ? '#f91880' : 'none'}; stroke:${isLiked ? '#f91880' : 'currentColor'}"><path d="M16.697 5.5c-1.222-.06-2.679.351-3.53 2.12L12 9.356l-1.167-1.736c-.85-1.769-2.308-2.18-3.53-2.12-2.73.06-4.914 2.312-4.914 5.15 0 5.045 4.054 8.299 9.074 12.484a.658.658 0 00.836 0c5.02-4.185 9.074-7.439 9.074-12.484 0-2.838-2.183-5.09-4.914-5.15z" stroke-width="1.5"/></svg> ${p.likes.length}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <div id="replies-${p.id}" class="hidden bg-[#0a0a0a]">
                <div class="px-4 py-3 flex gap-2 border-t x-border">
                    <input id="reply-input-${p.id}" type="text" placeholder="返信をポスト" class="flex-1 bg-transparent outline-none text-sm border-b x-border focus:border-blue-500">
                    <button onclick="submitReply(${p.id})" class="btn-blue text-white px-3 py-1 rounded-full text-xs font-bold">返信</button>
                </div>
                <div id="reply-list-${p.id}">${repliesList}</div>
            </div>
        </div>`;
}

/**
 * 描画更新
 */
function refreshCurrentView() {
    if (!document.getElementById('view-home').classList.contains('hidden')) renderHome();
    if (!document.getElementById('view-profile').classList.contains('hidden')) renderProfile();
    if (!document.getElementById('view-explore').classList.contains('hidden')) renderSearch();
}

function renderHome() { 
    document.getElementById('home-timeline').innerHTML = posts.map(createPostHTML).join(''); 
}

function renderSearch() {
    const q = document.getElementById('search-input').value.toLowerCase();
    const results = q ? posts.filter(p => p.content.toLowerCase().includes(q) || p.handle.includes(q)) : posts;
    document.getElementById('search-results').innerHTML = results.map(createPostHTML).join('');
}

function renderProfile() {
    const u = users[currentViewUser];
    if (!u) return;

    document.getElementById('prof-header-name').innerText = u.name;
    document.getElementById('prof-name').innerText = u.name;
    document.getElementById('prof-handle').innerText = "@" + u.handle;
    document.getElementById('prof-bio').innerText = u.bio || "";
    document.getElementById('count-following').innerText = (u.following || []).length;
    document.getElementById('count-followers').innerText = (u.followers || []).length;
    
    const myPosts = posts.filter(p => p.handle === u.handle);
    document.getElementById('prof-post-count').innerText = myPosts.length + ' ポスト';

    const actionArea = document.getElementById('prof-action-area');
    if (u.handle === me.handle) {
        actionArea.innerHTML = `<button onclick="toggleEditModal()" class="border x-border px-4 py-1.5 rounded-full font-bold hover:bg-white/10">プロフィールを編集</button>`;
    } else {
        const isF = (me.following || []).includes(u.handle);
        actionArea.innerHTML = `<button onclick="toggleFollow('${u.handle}')" class="${isF ? 'border x-border' : 'bg-white text-black'} px-4 py-1.5 rounded-full font-bold text-sm">${isF ? 'フォロー中' : 'フォロー'}</button>`;
    }

    const filtered = currentTab === 'posts' ? myPosts : posts.filter(p => (p.likes || []).includes(u.handle));
    document.getElementById('profile-timeline').innerHTML = filtered.map(createPostHTML).join('');
}

function renderSuggestions() {
    const list = Object.values(users).filter(u => u.handle !== me.handle).slice(0, 3);
    document.getElementById('suggestion-list').innerHTML = list.map(u => `
        <div class="flex items-center justify-between py-3 cursor-pointer" onclick="nav('profile', '${u.handle}')">
            <div class="flex gap-2">
                <div class="w-10 h-10 rounded-full bg-gray-700"></div>
                <div>
                    <p class="font-bold text-sm">${u.name}</p>
                    <p class="text-[#71767b] text-sm">@${u.handle}</p>
                </div>
            </div>
            <button onclick="event.stopPropagation(); toggleFollow('${u.handle}')" class="bg-white text-black px-4 py-1 rounded-full font-bold text-sm">
                ${(me.following || []).includes(u.handle) ? '中' : 'フォロー'}
            </button>
        </div>`).join('');
}

/**
 * UIパーツ操作
 */
function setTab(t) {
    currentTab = t;
    ['posts', 'likes'].forEach(x => {
        const el = document.getElementById('tab-' + x);
        if (x === t) el.classList.add('active-tab');
        else el.classList.remove('active-tab');
    });
    renderProfile();
}

function toggleEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.toggle('hidden');
    document.getElementById('edit-name').value = me.name;
    document.getElementById('edit-bio').value = me.bio || "";
}

function toggleReply(id) {
    const section = document.getElementById(`replies-${id}`);
    section.classList.toggle('hidden');
}

function togglePostBtn(btnId, inputId) {
    const val = document.getElementById(inputId).value.trim();
    document.getElementById(btnId).disabled = (val === "");
}

// 実行開始
initApp();
