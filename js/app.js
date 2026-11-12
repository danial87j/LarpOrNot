// ۱. گرفتن المنت‌های اصلی صفحه (DOM Elements)
const views = {
    start: document.getElementById('startView'),
    loading: document.getElementById('loadingView'),
    results: document.getElementById('resultsView')
};

const checkBtn = document.getElementById('checkBtn');
const resetBtn = document.getElementById('resetBtn');
const loadingText = document.getElementById('loadingText');

// المنت‌های بخش نتایج که قراره با دیتای واقعی پر بشن
const uiResults = {
    moodTitle: document.getElementById('moodTitle'),
    moodDesc: document.getElementById('moodDesc'),
    nicheScore: document.getElementById('nicheScore'),
    nicheBar: document.getElementById('nicheBar'),
    larpVerdict: document.getElementById('larpVerdict'),
    vibeTags: document.getElementById('vibeTags'),
    recentTracksList: document.getElementById('recentTracksList') // <--- این خط اضافه شد
};

// لیست پیام‌هایی که موقع لودینگ به ترتیب نمایش داده میشن
const loadingMessages = [
    "We are gathering your recent tracks...",
    "Checking artist popularity scores...",
    "Calculating your underground larp level...",
    "Decoding your current emotional state..."
];

let loadingInterval = null;

// ۲. تابع برای سوییچ کردن بین صفحات (Start, Loading, Results)
function switchView(targetView) {
    // اول کلاس active رو از هر سه تا صفحه برمی‌داریم
    Object.values(views).forEach(view => {
        view.classList.remove('active');
    });
    // بعد فقط به صفحه‌ای که می‌خوایم کلاس active میدیم
    views[targetView].classList.add('active');
}

// ۳. تابع شروع انیمیشن متن‌های لودینگ
function startLoadingAnimation() {
    let step = 0;
    loadingText.textContent = loadingMessages[0];

    // هر ۱۲۰۰ میلی‌ثانیه (۱.۲ ثانیه) متن رو عوض می‌کنیم
    loadingInterval = setInterval(() => {
        step++;
        if (step < loadingMessages.length) {
            loadingText.textContent = loadingMessages[step];
        }
    }, 1200);
}

// توقف انیمیشن لودینگ وقتی دیتا آماده شد
function stopLoadingAnimation() {
    clearInterval(loadingInterval);
}

// ۴. تابع قرار دادن اطلاعات نهایی داخل HTML
function renderResults(data) {
    uiResults.moodTitle.textContent = data.moodTitle;
    uiResults.moodDesc.textContent = data.moodDesc;
    
    // انیمیشن پر شدن نوار درصد
    uiResults.nicheScore.textContent = `${data.nicheScore}%`;
    uiResults.nicheBar.style.width = '0%'; // اول صفر می‌کنیم که انیمیشن دیده بشه
    setTimeout(() => {
        uiResults.nicheBar.style.width = `${data.nicheScore}%`;
    }, 100);

    uiResults.larpVerdict.textContent = data.larpVerdict;

    // ساختن تگ‌ها به صورت داینامیک
    uiResults.vibeTags.innerHTML = ''; // پاک کردن تگ‌های قبلی
    data.tags.forEach(tagText => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tagText;
        uiResults.vibeTags.appendChild(span);
    });

    // ساختن لیست ۵ آهنگ اخیر با کاور و اسم آرتیست
    uiResults.recentTracksList.innerHTML = '';
    if (data.last5Tracks && data.last5Tracks.length > 0) {
        data.last5Tracks.forEach(track => {
            const item = document.createElement('div');
            item.className = 'track-item';
            item.innerHTML = `
                <img src="${track.cover}" alt="cover" class="track-cover">
                <div class="track-info">
                    <span class="track-name">${track.name}</span>
                    <span class="track-artist">${track.artist}</span>
                </div>
            `;
            uiResults.recentTracksList.appendChild(item);
        });
    } else {
        uiResults.recentTracksList.innerHTML = '<p style="font-size:12px; color:#a7a7a7;">No recent tracks found in Spotify history.</p>';
    }
}

// ۵. اجرای آنالیز واقعی و مدیریت صفحه لودینگ
async function runRealAnalysis(token) {
    switchView('loading');
    startLoadingAnimation();

    try {
        // همزمان هم دیتا رو می‌گیریم و هم حداقل ۴ ثانیه لودینگ رو نشون میدیم تا متن‌های انگلیسی کامل خونده بشن
        const [rawData] = await Promise.all([
            fetchSpotifyData(token),
            new Promise(resolve => setTimeout(resolve, 4200))
        ]);

        if (!rawData) return;

        // فرستادن آهنگ‌ها به تابع تحلیلگر
        const finalReport = analyzeVibeAndLarp(rawData.tracks, rawData.artists, rawData.recentTracks);

        stopLoadingAnimation();
        renderResults(finalReport);
        switchView('results');

    } catch (error) {
        stopLoadingAnimation();
        alert("Error: " + error.message);
        switchView('start');
    }
}

// ۶. وقتی روی دکمه Check My Mood کلیک می‌شه
checkBtn.addEventListener('click', () => {
    const savedToken = localStorage.getItem('spotify_token');
    if (savedToken) {
        runRealAnalysis(savedToken);
    } else {
        redirectToSpotifyLogin();
    }
});

// ۷. وقتی کاربر توی صفحه اسپاتیفای دکمه Agree رو می‌زنه و برمی‌گرده به سایت ما
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        // تمیز کردن آدرس بالای مرورگر (حذف ?code=...)
        window.history.replaceState({}, document.title, window.location.pathname);
        
        switchView('loading');
        startLoadingAnimation();

        try {
            const token = await getAccessToken(code);
            await runRealAnalysis(token);
        } catch (err) {
            stopLoadingAnimation();
            console.error(err);
            alert("مشکلی در دریافت توکن پیش اومد. دوباره امتحان کن.");
            switchView('start');
        }
    }
});

// ۸. دکمه Scan Again
resetBtn.addEventListener('click', () => {
    switchView('start');
});