// ۱. تنظیمات پایه اتصال به اسپاتیفای
const CLIENT_ID = '82b33836340a416f9794ca03b9bbda03'; 

// این خط به صورت هوشمند آدرس دقیق صفحه فعلی (چه با index.html چه بدون اون) رو می‌گیره تا ارور نگیریم
const REDIRECT_URI = window.location.origin + window.location.pathname;

// دسترسی‌هایی که از کاربر می‌خوایم: دیدن آهنگ‌های اخیر و دیدن تاپ آرتیست‌ها
const SCOPES = 'user-read-recently-played user-top-read';


// ۲. ساخت یک رشته تصادفی برای امنیت لاگین
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// ۳. رمزنگاری (Hash) رشته بالا با الگوریتم SHA-256
async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// ۴. هدایت کاربر به صفحه لاگین اسپاتیفای
async function redirectToSpotifyLogin() {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // ذخیره رشته اصلی توی مرورگر تا وقتی کاربر از صفحه اسپاتیفای برگشت، داشته باشیمش
    localStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    // فرستادن کاربر به آدرس لاگین اسپاتیفای
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// ۵. تبدیل کد برگشتی از اسپاتیفای به Access Token نهایی
async function getAccessToken(code) {
    const codeVerifier = localStorage.getItem('code_verifier');

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: codeVerifier
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });

    const data = await response.json();
    if (data.access_token) {
        // ذخیره توکن توی مرورگر که هر دفعه نخواد دوباره لاگین کنه
        localStorage.setItem('spotify_token', data.access_token);
        return data.access_token;
    }
    throw new Error('خطا در دریافت توکن از اسپاتیفای');
}

// ۶. دریافت همزمان آهنگ‌های اخیر + تاپ آرتیست‌ها و تاپ ترک‌ها (بدون خطای NaN)
async function fetchSpotifyData(token) {
    const headers = { 'Authorization': `Bearer ${token}` };

    // ارسال ۳ درخواست به صورت موازی برای سرعت بالا و دقت ۱۰۰٪
    const [recentRes, topArtistsRes, topTracksRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me/player/recently-played?limit=30', { headers }),
        fetch('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=20', { headers }),
        fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20', { headers })
    ]);

    // اگر توکن منقضی شده بود، پاکش کن و دوباره لاگین کن
    if (recentRes.status === 401 || topArtistsRes.status === 401) {
        localStorage.removeItem('spotify_token');
        redirectToSpotifyLogin();
        return null;
    }

    const recentData = await recentRes.json();
    const topArtistsData = await topArtistsRes.json();
    const topTracksData = await topTracksRes.json();

    const recentTracks = (recentData.items || []).map(item => item.track).filter(Boolean);
    const topTracks = topTracksData.items || [];
    const artists = topArtistsData.items || [];

    // ترکیب ترک‌های اخیر و تاپ ترک‌ها برای اینکه مطمئن بشیم دیتا خالی نیست
    const allTracks = [...recentTracks, ...topTracks];

    // لاگ گرفتن توی کنسول برای اینکه خودت ببینی اسپاتیفای چه دیتایی برگردونده
    console.log("Tracks fetched:", allTracks);
    console.log("Artists fetched:", artists);

    if (allTracks.length === 0 && artists.length === 0) {
        throw new Error("اطلاعاتی از اکانتت دریافت نشد!");
    }

    return { tracks: allTracks, artists: artists, recentTracks: recentTracks };
}


// ۷. الگوریتم پیشرفته تحلیل مود، ژانرها و محاسبه وزن‌دار Larp / Niche Score
function analyzeVibeAndLarp(tracks, artists, recentTracks) {
    const sourceTracks = (recentTracks && recentTracks.length > 0) ? recentTracks : tracks;

    // --- الف) الگوریتم پیشرفته محاسبه Niche / Larp Score ---
    const validTracks = sourceTracks.filter(t => typeof t.popularity === 'number');
    const validArtists = artists.filter(a => typeof a.popularity === 'number');

    // ۱. میانگین پایه محبوبیت (۰ تا ۱۰۰)
    const avgTrackPop = validTracks.length > 0
        ? validTracks.reduce((sum, t) => sum + t.popularity, 0) / validTracks.length
        : 45;

    const avgArtistPop = validArtists.length > 0
        ? validArtists.reduce((sum, a) => sum + a.popularity, 0) / validArtists.length
        : avgTrackPop;

    // وزن بیشتر به ترک‌های اخیر (۶۵٪ ترک‌ها، ۳۵٪ آرتیست‌ها)
    const weightedPopularity = (avgTrackPop * 0.65) + (avgArtistPop * 0.35);
    let baseNiche = 100 - weightedPopularity;

    // ۲. بونوس زیرزمینی (Underground Bonus): به ازای هر ترکی که محبوبیتش زیر ۳۵ باشه امتیاز اضافه می‌دیم
    const undergroundTracksCount = validTracks.filter(t => t.popularity < 35).length;
    const ultraObscureCount = validTracks.filter(t => t.popularity < 18).length;
    const obscurityBonus = (undergroundTracksCount * 1.5) + (ultraObscureCount * 2.5);

    // جمع‌آوری تمام ژانرها، نام ترک‌ها و آرتیست‌ها برای اسکن متنی
    const rawGenresList = artists.flatMap(a => a.genres || []);
    const allGenres = rawGenresList.join(' ').toLowerCase();
    const trackNames = sourceTracks.map(t => t.name || '').join(' ').toLowerCase();
    const artistNames = sourceTracks.flatMap(t => (t.artists || []).map(a => a.name.toLowerCase())).join(' ');
    const combinedText = `${allGenres} ${trackNames} ${artistNames}`;

    // ۳. بونوس ژانرهای لارپی و خاص (RYM / Music Nerd Genres)
    const larpMultiplierGenres = [
        'shoegaze', 'slowcore', 'post-rock', 'post-punk', 'math rock', 'midwest emo',
        'noise', 'drone', 'ambient', 'krautrock', 'no wave', 'coldwave', 'darkwave',
        'blackgaze', 'breakcore', 'idm', 'glitch', 'avant-garde', 'experimental',
        'art rock', 'prog', 'progressive', 'ethereal', 'witch house', 'vaporwave',
        'lo-fi', 'sadcore', 'dream pop', 'neoclassical', 'dungeon synth', 'sludge'
    ];

    let genreLarpBonus = 0;
    larpMultiplierGenres.forEach(g => {
        if (combinedText.includes(g)) genreLarpBonus += 3.5;
    });
    // سقف بونوس ژانر تا ۱۸ درصد
    genreLarpBonus = Math.min(18, genreLarpBonus);

    // محاسبه نهایی امتیاز لارپ با منحنی غیرخطی (بین ۱ تا ۹۹ درصد)
    let nicheScore = Math.round(baseNiche + obscurityBonus + genreLarpBonus);
    nicheScore = Math.max(4, Math.min(99, nicheScore));


    // --- ب) دیکشنری گسترده ژانرها و کلمات کلیدی برای تشخیص دقیق احساسات ---
    const moodLexicon = {
        blue: [
            'sad', 'melanchol', 'slowcore', 'shoegaze', 'post-punk', 'doom', 'gloom', 
            'emo', 'midwest emo', 'sadcore', 'darkwave', 'coldwave', 'depress', 'post-rock', 
            'lonely', 'blue', 'cry', 'heartbreak', 'grief', 'tears', 'hurt', 'empty', 
            'have a nice life', 'radiohead', 'elliott smith', 'cigarettes after sex', 
            'mitski', 'phoebe bridgers', 'joy division', 'the smiths', 'interpol', 'low', 
            'duster', 'giles corey', 'car seat headrest', 'chamber pop', 'indie folk', 'acoustic'
        ],
        happy: [
            'happy', 'pop', 'dance', 'disco', 'funk', 'upbeat', 'party', 'house', 
            'french house', 'nu-disco', 'sunshine', 'good', 'tropical', 'synthpop', 
            'indie pop', 'feel good', 'daft punk', 'electropop', 'hyperpop', 'eurodance', 
            'boogie', 'soul', 'motown', 'summer', 'bright', 'groove', 'funky', 'city pop', 
            'bedroom pop', 'afrobeats', 'reggaeton', 'bubblegum'
        ],
        intense: [
            'metal', 'heavy metal', 'nu metal', 'thrash', 'death', 'black metal', 'metalcore',
            'rock', 'hard rock', 'punk', 'hardcore', 'post-hardcore', 'industrial', 'grunge', 
            'rage', 'phonk', 'drill', 'trap metal', 'techno', 'hardstyle', 'breakcore', 
            'drum and bass', 'dnb', 'jungle', 'cyberpunk', 'neurofunk', 'dubstep', 'aggressive',
            'deftones', 'slipknot', 'nine inch nails', 'gojira', 'tool', 'system of a down'
        ],
        existential: [
            'prog', 'progressive', 'art rock', 'psychedelic', 'psych', 'experimental', 
            'avant-garde', 'idm', 'krautrock', 'math rock', 'post-metal', 'blackgaze', 
            'ambient', 'drone', 'space rock', 'neo-psychedelia', 'jazz fusion', 'abstract', 
            'concept', 'pink floyd', 'king crimson', 'aphex twin', 'boards of canada', 
            'swans', 'godspeed you! black emperor', 'alcest', 'my bloody valentine', 'cocteau twins'
        ],
        chill: [
            'chill', 'lo-fi', 'lofi', 'downtempo', 'trip hop', 'chillwave', 'dream pop', 
            'r&b', 'neo-soul', 'jazz', 'bossa nova', 'soft rock', 'indie r&b', 'lounge', 
            'synthwave', 'retrowave', 'vaporwave', 'smooth', 'late night', 'nujabes', 
            'khruangbin', 'mac demarco', 'tame impala', 'beach house', 'massive attack', 'portishead'
        ]
    };

    const scores = { blue: 0, happy: 0, intense: 0, existential: 0, chill: 0 };

    // امتیازدهی به هر دسته بر اساس تکرار در ژانرها و ترک‌ها
    Object.keys(moodLexicon).forEach(moodKey => {
        moodLexicon[moodKey].forEach(word => {
            if (combinedText.includes(word)) {
                // اگر کلمه دقیقاً توی لیست ژانرها بود ۳ امتیاز، اگر توی اسم ترک/آرتیست بود ۲ امتیاز
                scores[moodKey] += allGenres.includes(word) ? 3 : 2;
            }
        });
    });

    // پیدا کردن بالاترین امتیاز احساسی
    const topMood = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    const maxScore = scores[topMood];

    let moodTitle = "";
    let moodDesc = "";
    let tags = [];

    if (maxScore === 0) {
        // اگر هیچ کلمه‌ای مچ نشد، بر اساس درصد خاص بودن تصمیم بگیر
        if (nicheScore >= 60) {
            moodTitle = "Mysterious & Unreadable 🌑";
            moodDesc = "Your rotation is so deep off the grid that standard mood radars can't even box you in today.";
            tags = ["#OffTheGrid", "#EnigmaVibes"];
        } else {
            moodTitle = "Chill & Cruising 🎧";
            moodDesc = "Your emotional radar is super balanced today. Not feeling blue, not overly hyped—just vibing.";
            tags = ["#BalancedVibe", "#DailyGroove"];
        }
    } else if (topMood === 'blue') {
        moodTitle = scores.blue > 10 ? "Deeply Melancholic & Blue 🌧️" : "Feeling a Bit Blue 🌧️";
        moodDesc = "You're in a heavy, reflective headspace today. Your queue is packed with slowcore, minor chords, or emotionally devastating tracks.";
        tags = ["#FeelingBlue", "#MelancholicState"];
    } else if (topMood === 'existential') {
        moodTitle = "Existential & Astral 🪐";
        moodDesc = "Your brain is operating on another frequency today. Heavy on progressive structures, atmospheric walls of sound, and deep introspection.";
        tags = ["#ExistentialDread", "#CosmicVibes"];
    } else if (topMood === 'intense') {
        moodTitle = "High Voltage & Locked In ⚡";
        moodDesc = "Pure adrenaline and heavy distortion. You're either crushing a workout, coding at 200 WPM, or fighting inner demons.";
        tags = ["#HighOctane", "#HeavyRotation"];
    } else if (topMood === 'happy') {
        moodTitle = "Dopamine Rush & Upbeat ☀️";
        moodDesc = "You're radiating pure serotonin today! Groovy basslines, infectious hooks, and zero room for bad vibes.";
        tags = ["#HighSpirits", "#DopamineBoost"];
    } else {
        moodTitle = "Late-Night Velvet & Chill 🌊";
        moodDesc = "Smooth, hazy, and laid-back. You're floating through dreamy textures and effortless grooves today.";
        tags = ["#DreamState", "#SmoothRotation"];
    }

    // --- ج) استخراج ۵ آهنگ اخیر برای نمایش در لیست ---
    const last5Tracks = sourceTracks.slice(0, 5).map(t => ({
        name: t.name || "Unknown Track",
        artist: (t.artists && t.artists.length > 0) ? t.artists.map(a => a.name).join(', ') : "Unknown Artist",
        cover: (t.album && t.album.images && t.album.images.length > 0) ? t.album.images[0].url : ""
    }));

    const sampleArtist = last5Tracks.length > 0 
        ? last5Tracks[0].artist.split(',')[0] 
        : (artists.length > 0 && artists[0].name ? artists[0].name : "your top artists");

    // --- د) درجه بندی ۵ سطحی و شوخ‌طبعانه برای Larp Verdict ---
    let larpVerdict = "";

    if (nicheScore >= 82) {
        larpVerdict = `Final Boss of RYM (${nicheScore}% Niche). Listening to ${sampleArtist} like you're allergic to anyone with over 10k monthly listeners. Maximum underground larp.`;
        tags.push("#RYMWarrior");
    } else if (nicheScore >= 65) {
        larpVerdict = `Supreme Music Gatekeeper (${nicheScore}% Niche). Spinning ${sampleArtist} and silently judging everyone else's Spotify Wrapped.`;
        tags.push("#GatekeeperCertified");
    } else if (nicheScore >= 48) {
        larpVerdict = `Certified Indie Snob (${nicheScore}% Niche). Good balance—playing ${sampleArtist} proves you want people to think you're mysterious and deep.`;
        tags.push("#IndieCred");
    } else if (nicheScore >= 28) {
        larpVerdict = `Respectable Casual (${nicheScore}% Niche). You've got real flavor with ${sampleArtist}, but you won't scare anyone away if they hand you the aux cord.`;
        tags.push("#SafeAuxCord");
    } else {
        larpVerdict = `Zero Larp Detected (${nicheScore}% Niche). Pure chart-toppers and ${sampleArtist}. At least you're honest and don't fake liking obscure noise!`;
        tags.push("#MainstreamEnjoyer");
    }

    // اضافه کردن حداکثر ۲ ژانر واقعی خود کاربر به تگ‌های پایین کارت
    const uniqueUserGenres = [...new Set(rawGenresList)].slice(0, 2);
    uniqueUserGenres.forEach(g => {
        // تبدیل مثلا "post-punk" به "#PostPunk"
        const formattedTag = '#' + g.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
        if (!tags.includes(formattedTag)) {
            tags.push(formattedTag);
        }
    });

    return { moodTitle, moodDesc, nicheScore, larpVerdict, tags, last5Tracks };
}