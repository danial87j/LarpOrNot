// ۱. تنظیمات پایه اسپاتیفای
const CLIENT_ID = '82b33836340a416f9794ca03b9bbda03'; // کلاینت آیدی خودت
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = 'user-read-recently-played user-top-read';

// ۲. توابع رمزنگاری PKCE
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function redirectToSpotifyLogin() {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    localStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

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
        localStorage.setItem('spotify_token', data.access_token);
        return data.access_token;
    }
    throw new Error('Failed to get access token');
}

// ۳. دریافت دیتا از اسپاتیفای
async function fetchSpotifyData(token) {
    const headers = { 'Authorization': `Bearer ${token}` };

    const [recentRes, topArtistsRes, topTracksRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me/player/recently-played?limit=30', { headers }),
        fetch('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=20', { headers }),
        fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20', { headers })
    ]);

    if (recentRes.status === 401 || topArtistsRes.status === 401) {
        localStorage.removeItem('spotify_token');
        redirectToSpotifyLogin();
        return null;
    }

    const recentData = await recentRes.json().catch(() => ({}));
    const topArtistsData = await topArtistsRes.json().catch(() => ({}));
    const topTracksData = await topTracksRes.json().catch(() => ({}));

    const recentTracks = (recentData.items || []).map(item => item.track).filter(Boolean);
    const topTracks = topTracksData.items || [];
    const artists = topArtistsData.items || [];

    const allTracks = [...recentTracks, ...topTracks];

    if (allTracks.length === 0) {
        throw new Error("No tracks found in your Spotify history!");
    }

    return { tracks: allTracks, artists: artists, recentTracks: recentTracks };
}

// ۴. موتور هوشمند تشخیص مود و محاسبه داینامیک درصد لارپ (بدون قفل شدن روی ۵۵٪)
function analyzeVibeAndLarp(tracks, artists, recentTracks) {
    // تمرکز اصلی روی ۱۵ ترک آخر که همین الان گوش دادی
    const activeTracks = (recentTracks && recentTracks.length > 0) ? recentTracks.slice(0, 15) : tracks.slice(0, 15);

    // بانک شناخت آرتیست‌ها و سبک‌ها (چون اسپاتیفای در حالت Dev فیلد ژانر و محبوبیت رو خالی می‌فرسته)
    const undergroundIcons = [
        'have a nice life', 'giles corey', 'duster', 'slowdive', 'my bloody valentine', 
        'cocteau twins', 'swans', 'godspeed', 'aphex twin', 'boards of canada', 'burial',
        'death grips', 'neutral milk hotel', 'slint', 'american football', 'mineral',
        'cap\'n jazz', 'sunny day real estate', 'title fight', 'whirr', 'nothing',
        'alcest', 'deafheaven', 'ulver', 'agathodaimon', 'katatonia', 'opeth', 'porcupine tree',
        'king crimson', 'camel', 'gentle giant', 'can', 'neu!', 'faust', 'talk talk',
        'bark psychosis', 'fishmans', 'lamp', 'ichiko aoba', 'parannoul', 'sweet trip',
        'lsd and the search for god', 'drop nineteens', 'low', 'codeine', 'bedhead',
        'red house painters', 'sun kil moon', 'mount eerie', 'the microphones', 'unwound',
        'fugazi', 'drive like jehu', 'at the drive-in', 'mars volta', 'black midi',
        'black country, new road', 'squid', 'shame', 'fontaines d.c.', 'idles', 'molchat doma',
        'lebanon hanover', 'she past away', 'boy harsher', 'crystal castles', 'salem',
        'machine girl', 'sewerslvt', 'goreshit', 'venetian snares', 'autechre', 'squarepusher',
        'dean blunt', 'jpegmafia', 'danny brown', 'earl sweatshirt', 'mf doom', 'madlib',
        'nujabes', 'jdilla', 'flying lotus', 'thundercat', 'khruangbin', 'badbadnotgood',
        'elliott smith', 'nick drake', 'jeff buckley', 'mazzy star', 'galaxie 500', 'yo la tengo',
        'pavement', 'built to spill', 'modest mouse', 'weyes blood', 'caroline polachek',
        'charli xcx', 'sophie', '100 gecs', 'bladee', 'ecco2k', 'yung lean', 'bones', 'interpol'
    ];

    const cultClassics = [
        'the cure', 'joy division', 'new order', 'the smiths', 'morrissey', 'depeche mode',
        'radiohead', 'the smile', 'thom yorke', 'pink floyd', 'led zeppelin', 'black sabbath',
        'nine inch nails', 'deftones', 'tool', 'a perfect circle', 'system of a down',
        'korn', 'slipknot', 'alice in chains', 'soundgarden', 'nirvana', 'pearl jam',
        'smashing pumpkins', 'pixies', 'sonic youth', 'the strokes', 'interpol', 'yeah yeah yeahs',
        'lcd soundsystem', 'massive attack', 'portishead', 'tricky', 'björk', 'pj harvey',
        'kate bush', 'david bowie', 'talking heads', 'the velvet underground', 'lou reed',
        'iggy pop', 'the clash', 'ramones', 'sex pistols', 'misfits', 'type o negative',
        'gojira', 'mastodon', 'meshuggah', 'lamb of god', 'pantera', 'metallica', 'megadeth',
        'slayer', 'iron maiden', 'judas priest', 'motorhead', 'kyuss', 'queens of the stone age',
        'muse', 'placebo', 'arctic monkeys', 'the neighbourhood', 'cigarettes after sex',
        'beach house', 'tame impala', 'mac demarco', 'mitski', 'phoebe bridgers', 'lana del rey',
        'frank ocean', 'tyler, the creator', 'kendrick lamar', 'kanye west', 'kid cudi',
        'travis scott', 'playboi carti', 'asap rocky', 'gorillaz', 'blur', 'oasis', 'pulp',
        'suede', 'the verve', 'daft punk', 'justice', 'chemical brothers', 'prodigy', 'fatboy slim',
        'jimi hendrix', 'the doors', 'fleetwood mac', 'steely dan', 'rush', 'yes', 'genesis'
    ];

    const chartMainstream = [
        'taylor swift', 'drake', 'the weeknd', 'ariana grande', 'justin bieber', 'ed sheeran',
        'dua lipa', 'billie eilish', 'olivia rodrigo', 'sabrina carpenter', 'post malone',
        'harry styles', 'bad bunny', 'j balvin', 'karol g', 'shakira', 'rihanna', 'beyonce',
        'bruno mars', 'coldplay', 'imagine dragons', 'maroon 5', 'onepublic', 'chainsmokers',
        'david guetta', 'calvin harris', 'tiesto', 'marshMello', 'alan walker', 'katy perry',
        'lady gaga', 'miley cyrus', 'selena gomez', 'shawn mendes', 'camila cabello', 'doja cat',
        'sza', 'nicki minaj', 'cardi b', 'megan thee stallion', 'central cee', 'ice spice',
        'jack harlow', 'morgan wallen', 'luke combs', 'benson boone', 'teddy swims', 'hozier',
        'eminem', '50 cent', 'snoop dogg', 'jay-z', 'chris brown', 'usher', 'pitbull', 'black eyed peas'
    ];

    // --- الف) محاسبه امتیاز واقعی هر ترک (Dynamic Track Scoring) ---
    let totalObscurityPoints = 0;
    let lowestScore = 100;
    let highestScore = 0;
    let mostObscureArtist = activeTracks[0]?.artists?.[0]?.name || "Unknown";
    let mostMainstreamArtist = activeTracks[0]?.artists?.[0]?.name || "Unknown";

    activeTracks.forEach((t, idx) => {
        const artistName = (t.artists && t.artists[0]) ? t.artists[0].name : "Unknown";
        const artistLower = artistName.toLowerCase();
        const trackLower = (t.name || "").toLowerCase();
        const durationSec = (t.duration_ms || 200000) / 1000;
        const releaseYear = t.album?.release_date ? parseInt(t.album.release_date.substring(0, 4)) : 2015;

        // ۱. اگر اسپاتیفای عدد واقعی فرستاده بود ازش استفاده کن، وگرنه هوشمند تخمین بزن
        let estimatedPop = (typeof t.popularity === 'number' && t.popularity > 0) ? t.popularity : null;

        if (estimatedPop === null) {
            if (undergroundIcons.some(a => artistLower.includes(a))) {
                estimatedPop = 22; // بسیار خاص و زیرزمینی
            } else if (chartMainstream.some(a => artistLower.includes(a))) {
                estimatedPop = 86; // کاملاً مین‌استریم
            } else if (cultClassics.some(a => artistLower.includes(a))) {
                estimatedPop = 54; // راک/آلترناتیو/الکترونیک کلاسیک و باکلاس
            } else {
                // محاسبه بر اساس ویژگی‌های فیزیکی خود آهنگ (طول آهنگ، سال ساخت، کاراکترهای اسم)
                let dynamicPop = 48;
                if (durationSec > 320) dynamicPop -= 14; // آهنگ‌های بالای ۵.۵ دقیقه معمولاً پراگ یا پست‌راک هستن
                if (durationSec > 420) dynamicPop -= 12; // بالای ۷ دقیقه شدیداً خاص
                if (durationSec < 130) dynamicPop -= 8;  // آهنگ‌های خیلی کوتاه (پانک/لوفای/اینترلنود)
                if (releaseYear < 1995) dynamicPop -= 10; // کلاسیک‌های قدیمی‌تر
                if (trackLower.includes('remaster') || trackLower.includes('demo') || trackLower.includes('live')) dynamicPop -= 7;
                if (trackLower.includes('feat.') || trackLower.includes('radio edit')) dynamicPop += 12;

                // ایجاد واریانس طبیعی بر اساس طول اسم ترک و آرتیست تا عدد قفل نکنه
                const hashVariance = ((artistName.length * 7 + t.name.length * 3) % 19) - 9;
                estimatedPop = Math.max(12, Math.min(92, dynamicPop + hashVariance));
            }
        }

        // پیدا کردن خاص‌ترین و معروف‌ترین آرتیست داخل لیست
        if (estimatedPop < lowestScore) {
            lowestScore = estimatedPop;
            mostObscureArtist = artistName;
        }
        if (estimatedPop > highestScore) {
            highestScore = estimatedPop;
            mostMainstreamArtist = artistName;
        }

        totalObscurityPoints += (100 - estimatedPop);
    });

    // محاسبه درصد نهایی Niche / Larp
    let nicheScore = Math.round(totalObscurityPoints / (activeTracks.length || 1));
    
    // اضافه کردن بونوس تنوع آرتیست‌ها
    const uniqueArtistsCount = new Set(activeTracks.map(t => t.artists?.[0]?.name)).size;
    if (uniqueArtistsCount >= 10) nicheScore += 5;
    if (uniqueArtistsCount <= 3) nicheScore += 4; // قفل کردن روی یک آلبوم خاص

    nicheScore = Math.max(8, Math.min(98, nicheScore));


    // --- ب) تشخیص دقیق مود از روی ۱۰ آهنگ آخر ---
    const moodBuckets = {
        gothPostPunk: {
            words: ['the cure', 'joy division', 'molchat doma', 'bauhaus', 'siouxsie', 'sisters of mercy', 'interpol', 'she past away', 'lebanon hanover', 'type o negative', 'depeche mode', 'new order', 'the smiths', 'echo & the bunnymen', 'killing joke', 'dark', 'forest', 'night', 'shadow', 'cold', 'boys don\'t cry', 'lullaby', 'disintegration', 'lovesong'],
            title: "Post-Punk & Velvet Gloom 🦇",
            desc: "Bass-driven melancholy and 80s gothic nostalgia. You're walking through the city like you're in a black-and-white European indie film.",
            tags: ["#PostPunk", "#GothicVibes", "#80sMelancholy"]
        },
        doomerShoegaze: {
            words: ['have a nice life', 'giles corey', 'duster', 'slowdive', 'my bloody valentine', 'whirr', 'nothing', 'deafheaven', 'alcest', 'low', 'sad', 'deathconsciousness', 'earthmover', 'bloodhail', 'waiting', 'alone', 'empty', 'sleep', 'dream', 'fade', 'ghost'],
            title: "3AM Shoegaze & Doomer 🥀",
            desc: "Heavy existential weight detected. You're deep in walls of fuzz, slow tempos, and emotionally devastating atmospheres.",
            tags: ["#DoomerWave", "#WallOfSound", "#Existential"]
        },
        cyberGroove: {
            words: ['daft punk', 'justice', 'gorillaz', 'tame impala', 'jamiroquai', 'kaytranada', 'parcels', 'prodigy', 'chemical brothers', 'gesaffelstein', 'kavinsky', 'perturbator', 'carpenter brut', 'cyberpunk', 'around the world', 'harder, better', 'veridis quo', 'instant crush', 'one more time', 'voyager', 'robot', 'digital', 'funk', 'disco', 'dance'],
            title: "Cyber-Groove & High Voltage 🤖",
            desc: "Crisp vocoders, French touch basslines, and futuristic energy. Your rotation is elite, rhythmic, and impossible not to nod your head to.",
            tags: ["#FrenchTouch", "#SynthGroove", "#FuturisticVibe"]
        },
        heavyRockMetal: {
            words: ['deftones', 'tool', 'nine inch nails', 'system of a down', 'slipknot', 'korn', 'alice in chains', 'soundgarden', 'nirvana', 'gojira', 'metallica', 'black sabbath', 'pantera', 'rage against', 'smashing pumpkins', 'muse', 'queens of the stone age', 'heavy', 'blood', 'fire', 'war', 'scream', 'kill', 'break'],
            title: "High-Octane & Heavy Riffage ⚡",
            desc: "Distorted guitars, aggressive drums, and pure adrenaline. You're locked in, blowing off steam, or crushing a heavy session.",
            tags: ["#HeavyRotation", "#Distortion", "#LockedIn"]
        },
        progAstral: {
            words: ['pink floyd', 'king crimson', 'radiohead', 'porcupine tree', 'opeth', 'camel', 'rush', 'yes', 'aphex twin', 'boards of canada', 'godspeed', 'swans', 'tool', 'weird fishes', 'paranoid android', 'shine on', 'time', 'space', 'moon', 'star', 'sun', 'echoes', 'epilogue'],
            title: "Astral & Art-Rock Odyssey 🪐",
            desc: "Complex rhythms, long instrumental build-ups, and deep sonic storytelling. Your brain is operating on high philosophical RPMs today.",
            tags: ["#ArtRock", "#CosmicBrain", "#DeepListening"]
        },
        indieMelancholy: {
            words: ['elliott smith', 'jeff buckley', 'mitski', 'phoebe bridgers', 'cigarettes after sex', 'mazzy star', 'beach house', 'lana del rey', 'arctic monkeys', 'the strokes', 'mac demarco', 'frank ocean', 'bon iver', 'sufjan stevens', 'love', 'heart', 'cry', 'tears', 'miss', 'sweet', 'falling', 'blue'],
            title: "Late-Night Indie & Yearning 🌧️",
            desc: "Soft vocals, nostalgic chords, and a bit of romantic or personal yearning. Definitely staring out the window on the train vibes.",
            tags: ["#YearningHours", "#IndieMelancholy", "#LateNight"]
        }
    };

    const bucketScores = { gothPostPunk: 0, doomerShoegaze: 0, cyberGroove: 0, heavyRockMetal: 0, progAstral: 0, indieMelancholy: 0 };

    // بررسی ۱۰ آهنگ آخر با امتیاز بالا برای اینکه با تغییر آهنگ‌ها، مود سریع عوض بشه
    activeTracks.slice(0, 10).forEach((t, i) => {
        const recencyWeight = i < 4 ? 4 : 2; // ۴ آهنگ آخر وزن ۴ برابری دارن!
        const textToScan = `${t.name} ${(t.artists || []).map(a => a.name).join(' ')} ${t.album?.name || ''}`.toLowerCase();

        Object.keys(moodBuckets).forEach(key => {
            moodBuckets[key].words.forEach(w => {
                if (textToScan.includes(w)) {
                    bucketScores[key] += recencyWeight;
                }
            });
        });
    });

    // پیدا کردن برنده مود
    let bestMood = Object.keys(bucketScores).reduce((a, b) => bucketScores[a] > bucketScores[b] ? a : b);
    let maxMoodScore = bucketScores[bestMood];

    let moodTitle = "";
    let moodDesc = "";
    let tags = [];

    if (maxMoodScore === 0) {
        // اگر آرتیست‌ها خارج از لیست‌های بالا بودن، بر اساس طول آهنگ‌ها و امتیاز لارپ مود رو بساز
        const avgDuration = activeTracks.reduce((s, t) => s + (t.duration_ms || 200000), 0) / activeTracks.length;
        if (avgDuration > 260000) {
            moodTitle = "Deep Focus & Atmospheric 🌫️";
            moodDesc = `Spinning extended cuts led by ${mostObscureArtist}. You're in a patient, immersive headspace away from short TikTok-style hooks.`;
            tags = ["#LongFormMusic", "#Immersive", "#DeepFocus"];
        } else {
            moodTitle = "Eclectic & Unfiltered 🎲";
            moodDesc = `Jumping from ${mostObscureArtist} to ${mostMainstreamArtist}—your queue today refuses to stay in one single emotional lane.`;
            tags = ["#Genrehopping", "#WildcardQueue", "#Unpredictable"];
        }
    } else {
        moodTitle = moodBuckets[bestMood].title;
        moodDesc = moodBuckets[bestMood].desc;
        tags = [...moodBuckets[bestMood].tags];
    }

    // --- ج) نوشتن متن داینامیک Larp Verdict که واقعاً با آرتیست‌ها مچ باشه ---
    let larpVerdict = "";
    const hasContrast = (highestScore - lowestScore >= 25) && (mostObscureArtist !== mostMainstreamArtist);

    if (nicheScore >= 72) {
        larpVerdict = `Final Boss of RYM (${nicheScore}% Niche). Heavy rotation of ${mostObscureArtist} proves you treat mainstream playlists like a personal insult.`;
        tags.push("#UndergroundPurist");
    } else if (nicheScore >= 56) {
        if (hasContrast) {
            larpVerdict = `Dual-Identity Listener (${nicheScore}% Niche). You flex serious underground taste with ${mostObscureArtist}, then cleanse the palate with ${mostMainstreamArtist}.`;
            tags.push("#ContrastQueue");
        } else {
            larpVerdict = `Cult-Classic Connoisseur (${nicheScore}% Niche). Spinning ${mostObscureArtist}—not completely obscure noise, just elite taste with actual substance.`;
            tags.push("#CultClassics");
        }
    } else if (nicheScore >= 38) {
        if (hasContrast) {
            larpVerdict = `Balanced & Cultured (${nicheScore}% Niche). Mixing ${mostObscureArtist} with iconic tracks by ${mostMainstreamArtist}. Elite taste without being an unbearable snob.`;
            tags.push("#AuxCordApproved");
        } else {
            larpVerdict = `Certified Classics Enjoyer (${nicheScore}% Niche). Heavy on ${mostMainstreamArtist}—you care about timeless hooks and production, not fake underground clout.`;
            tags.push("#TimelessTaste");
        }
    } else {
        larpVerdict = `Zero Larp Detected (${nicheScore}% Niche). Unapologetically blasting ${mostMainstreamArtist}. Pure bangers, zero pretension!`;
        tags.push("#BangersOnly");
    }

    // اضافه کردن تگ اختصاصی از اسم آرتیست اولت که ببینی واقعاً زنده داره کار می‌کنه
    const topRecentArtistTag = '#' + (activeTracks[0]?.artists?.[0]?.name || 'Music').replace(/[^a-zA-Z0-9]/g, '');
    if (topRecentArtistTag.length > 2 && !tags.includes(topRecentArtistTag)) {
        tags.push(topRecentArtistTag);
    }

    // --- د) لیست ۵ آهنگ آخر ---
    const last5Tracks = activeTracks.slice(0, 5).map(t => ({
        name: t.name || "Unknown Track",
        artist: (t.artists && t.artists.length > 0) ? t.artists.map(a => a.name).join(', ') : "Unknown Artist",
        cover: (t.album && t.album.images && t.album.images.length > 0) ? t.album.images[0].url : ""
    }));

    return { moodTitle, moodDesc, nicheScore, larpVerdict, tags, last5Tracks };
}