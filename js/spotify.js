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


// ۷. الگوریتم هوشمند تحلیل مود، تضاد سلیقه و تفکیک آرتیست‌های زیرزمینی از مین‌استریم
function analyzeVibeAndLarp(tracks, artists, recentTracks) {
    const sourceTracks = (recentTracks && recentTracks.length > 0) ? recentTracks : tracks;

    // ساخت یک مپ از آرتیست‌ها برای دسترسی سریع به ژانر و محبوبیت واقعی هر آرتیست
    const artistMap = {};
    artists.forEach(a => {
        if (a && a.id) artistMap[a.id] = a;
    });

    // ۱. پیدا کردن معروف‌ترین و ناشناخته‌ترین آرتیست در پلی‌لیست اخیر کاربر
    const enrichedTracks = sourceTracks.map((t, index) => {
        const primaryArtist = (t.artists && t.artists[0]) ? t.artists[0] : { name: "Unknown", id: null };
        const fullArtistData = artistMap[primaryArtist.id] || null;
        
        // اگر محبوبیت آرتیست رو داشتیم ازش استفاده می‌کنیم، وگرنه محبوبیت خود ترک
        const effectivePop = (fullArtistData && typeof fullArtistData.popularity === 'number')
            ? (fullArtistData.popularity * 0.6 + (t.popularity || 50) * 0.4)
            : (typeof t.popularity === 'number' ? t.popularity : 50);

        return {
            trackName: t.name || "Unknown Track",
            artistName: primaryArtist.name,
            popularity: effectivePop,
            trackPop: typeof t.popularity === 'number' ? t.popularity : 50,
            genres: fullArtistData ? (fullArtistData.genres || []) : [],
            isVeryRecent: index < 10 // ۱۰ آهنگ آخر وزن خیلی بیشتری برای مود امروز دارن
        };
    });

    // مرتب‌سازی برای پیدا کردن خاص‌ترین (Obscure) و معروف‌ترین (Mainstream) آرتیستی که گوش داده
    const uniqueByArtist = [];
    const seenArtists = new Set();
    enrichedTracks.forEach(item => {
        if (!seenArtists.has(item.artistName) && item.artistName !== "Unknown") {
            seenArtists.add(item.artistName);
            uniqueByArtist.push(item);
        }
    });

    const sortedByObscurity = [...uniqueByArtist].sort((a, b) => a.popularity - b.popularity);
    const mostObscure = sortedByObscurity[0] || { artistName: "underground artists", popularity: 20 };
    const mostMainstream = sortedByObscurity[sortedByObscurity.length - 1] || { artistName: "mainstream hits", popularity: 80 };

    // ۲. محاسبه دقیق‌تر Niche / Larp Score
    const avgPop = enrichedTracks.reduce((sum, item) => sum + item.popularity, 0) / (enrichedTracks.length || 1);
    let baseNiche = 100 - avgPop;

    // بونوس برای ترک‌های واقعاً زیرزمینی (محبوبیت زیر ۳۵)
    const deepUndergroundCount = enrichedTracks.filter(item => item.popularity < 35).length;
    const obscurityBonus = Math.min(20, deepUndergroundCount * 2.5);

    let nicheScore = Math.round(baseNiche + obscurityBonus);
    nicheScore = Math.max(5, Math.min(99, nicheScore));


    // ۳. تشخیص احساسات با وزن‌دهی ۳ برابری به ۱۰ آهنگ آخر (مودِ همین لحظه)
    const moodProfiles = {
        doomer: {
            keywords: ['slowcore', 'shoegaze', 'post-punk', 'doom', 'gloom', 'sadcore', 'darkwave', 'coldwave', 'blackgaze', 'depress', 'grief', 'lonely', 'empty', 'have a nice life', 'giles corey', 'duster', 'joy division', 'low', 'interpol', 'molchat doma'],
            title: "3AM Doomer & Melancholic 🥀",
            desc: "Heavy existential weight detected. You're deep in dark, reverb-drenched, or emotionally devastating territory right now.",
            baseTags: ["#DoomerWave", "#Melancholic", "#ReverbDrenched"]
        },
        blue: {
            keywords: ['sad', 'melanchol', 'emo', 'midwest emo', 'indie folk', 'chamber pop', 'acoustic', 'heartbreak', 'cry', 'tears', 'blue', 'hurt', 'miss you', 'radiohead', 'elliott smith', 'mitski', 'phoebe bridgers', 'the smiths', 'cigarettes after sex', 'jeff buckley'],
            title: "Feeling a Bit Blue 🌧️",
            desc: "You're in a soft, reflective, and slightly heartbroken headspace today. Lots of emotional vocals and minor chords in your queue.",
            baseTags: ["#FeelingBlue", "#InMyFeelings", "#SoftSadness"]
        },
        astral: {
            keywords: ['prog', 'progressive', 'art rock', 'post-rock', 'math rock', 'psychedelic', 'idm', 'ambient', 'drone', 'krautrock', 'experimental', 'avant-garde', 'space', 'cosmic', 'pink floyd', 'king crimson', 'tool', 'godspeed', 'aphex twin', 'boards of canada', 'swans'],
            title: "Astral & Existential 🪐",
            desc: "Your brain is operating on a completely different frequency today. Complex structures, long build-ups, and pure sonic cinema.",
            baseTags: ["#CosmicBrain", "#ProgAndArt", "#DeepListening"]
        },
        highVoltage: {
            keywords: ['metal', 'nu metal', 'thrash', 'death', 'metalcore', 'hardcore', 'industrial', 'punk', 'grunge', 'rage', 'phonk', 'drill', 'breakcore', 'drum and bass', 'techno', 'cyberpunk', 'heavy', 'deftones', 'nine inch nails', 'slipknot', 'gojira', 'system of a down', 'prodigy'],
            title: "High-Voltage & Locked In ⚡",
            desc: "Pure adrenaline and aggressive energy. You're either locking in on a massive task, hitting PRs, or running on pure caffeine.",
            baseTags: ["#HighOctane", "#LockedIn", "#AdrenalineRush"]
        },
        groovy: {
            keywords: ['french house', 'filter house', 'disco', 'nu-disco', 'funk', 'synthpop', 'electropop', 'electronic', 'dance', 'house', 'edm', 'groove', 'boogie', 'daft punk', 'justice', 'kaytranada', 'gorillaz', 'jamiroquai', 'parcels', 'tame impala', 'the weeknd'],
            title: "Electric Groove & Euphoria ✨",
            desc: "Infectious basslines, crisp synths, and elite rhythm. Your vibe today is upbeat, stylish, and impossible to sit still to.",
            baseTags: ["#MainCharacterGroove", "#SynthAndBass", "#HighSerotonin"]
        },
        chill: {
            keywords: ['chill', 'lo-fi', 'lofi', 'downtempo', 'trip hop', 'dream pop', 'chillwave', 'r&b', 'neo-soul', 'jazz', 'bossa nova', 'synthwave', 'vaporwave', 'beach house', 'mac demarco', 'nujabes', 'khruangbin', 'massive attack', 'portishead', 'frank ocean'],
            title: "Velvet Late-Night Chill 🌊",
            desc: "Smooth, hazy, and unbothered. You're floating through laid-back rhythms and warm atmospheric textures today.",
            baseTags: ["#VelvetVibes", "#Unbothered", "#SmoothRotation"]
        }
    };

    const moodScores = { doomer: 0, blue: 0, astral: 0, highVoltage: 0, groovy: 0, chill: 0 };

    // اسکن کردن تک‌تک ترک‌ها با وزن‌دهی به ترک‌های جدیدتر
    enrichedTracks.forEach(item => {
        const weight = item.isVeryRecent ? 3 : 1; // ۱۰ ترک آخر ۳ برابر مهم‌ترن
        const itemText = `${item.trackName} ${item.artistName} ${item.genres.join(' ')}`.toLowerCase();

        Object.keys(moodProfiles).forEach(moodKey => {
            moodProfiles[moodKey].keywords.forEach(kw => {
                if (itemText.includes(kw)) {
                    moodScores[moodKey] += (2 * weight);
                }
            });
        });
    });

    // اسکن کلی تاپ‌آرتیست‌ها به عنوان بک‌آپ
    const allTopGenres = artists.flatMap(a => a.genres || []).join(' ').toLowerCase();
    Object.keys(moodProfiles).forEach(moodKey => {
        moodProfiles[moodKey].keywords.forEach(kw => {
            if (allTopGenres.includes(kw)) moodScores[moodKey] += 1;
        });
    });

    const winningMoodKey = Object.keys(moodScores).reduce((a, b) => moodScores[a] > moodScores[b] ? a : b);
    const winningScore = moodScores[winningMoodKey];

    let moodTitle = "";
    let moodDesc = "";
    let tags = [];

    if (winningScore === 0) {
        moodTitle = "Eclectic & Unpredictable 🎲";
        moodDesc = "Your queue is jumping across so many different eras and styles today that you're impossible to put in a single emotional box.";
        tags = ["#GenreFluid", "#WildcardQueue"];
    } else {
        moodTitle = moodProfiles[winningMoodKey].title;
        moodDesc = moodProfiles[winningMoodKey].desc;
        tags = [...moodProfiles[winningMoodKey].baseTags];
    }

    // ۴. تولید متن هوشمند Larp Verdict بر اساس واقعیت محبوبیت آرتیست‌ها
    let larpVerdict = "";
    const hasContrast = (mostMainstream.popularity - mostObscure.popularity) >= 30 && mostObscure.artistName !== mostMainstream.artistName;

    if (nicheScore >= 75) {
        larpVerdict = `Final Boss of RYM (${nicheScore}% Niche). Heavy rotation of ${mostObscure.artistName} proves you actively avoid anything with mainstream radio play.`;
        tags.push("#UndergroundPurist");
    } else if (nicheScore >= 52) {
        if (hasContrast) {
            // اگر هم آرتیست زیرزمینی داره هم آرتیست خیلی معروف مثل Daft Punk!
            larpVerdict = `Dual-Personality Listener (${nicheScore}% Niche). You build serious underground cred with ${mostObscure.artistName}, then balance it out with classics like ${mostMainstream.artistName}.`;
            tags.push("#BestOfBothWorlds");
        } else {
            larpVerdict = `Certified Music Nerd (${nicheScore}% Niche). Spinning ${mostObscure.artistName} keeps your taste way sharper than the average algorithm slave.`;
            tags.push("#CuratedTaste");
        }
    } else if (nicheScore >= 32) {
        if (hasContrast) {
            larpVerdict = `Part-Time Indie, Full-Time Vibing (${nicheScore}% Niche). You dip your toes into ${mostObscure.artistName}, but ${mostMainstream.artistName} proves you still love iconic hits.`;
            tags.push("#SafeAuxCord");
        } else {
            larpVerdict = `Solid & Accessible (${nicheScore}% Niche). Heavy on ${mostMainstream.artistName}—good music without trying too hard to look obscure.`;
            tags.push("#NoFakeLarp");
        }
    } else {
        larpVerdict = `Zero Larp Detected (${nicheScore}% Niche). Unapologetically blasting ${mostMainstream.artistName}. You care about bangers, not underground clout!`;
        tags.push("#BangersOnly");
    }

    // ۵. اضافه کردن ژانرهای واقعی به تگ‌ها (تمیز و بدون تکرار)
    const rawGenres = artists.flatMap(a => a.genres || []);
    const cleanGenreTags = [...new Set(rawGenres)]
        .slice(0, 3)
        .map(g => '#' + g.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(''));

    cleanGenreTags.forEach(gt => {
        if (tags.length < 6 && !tags.includes(gt)) tags.push(gt);
    });

    // ۶. آماده‌سازی ۵ آهنگ آخر برای نمایش
    const last5Tracks = sourceTracks.slice(0, 5).map(t => ({
        name: t.name || "Unknown Track",
        artist: (t.artists && t.artists.length > 0) ? t.artists.map(a => a.name).join(', ') : "Unknown Artist",
        cover: (t.album && t.album.images && t.album.images.length > 0) ? t.album.images[0].url : ""
    }));

    return { moodTitle, moodDesc, nicheScore, larpVerdict, tags, last5Tracks };
}