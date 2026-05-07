const gameContainer = document.getElementById('game-container');
const playArea = document.getElementById('play-area');
const notesContainer = document.getElementById('notes-container');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const comboBox = document.querySelector('.combo-box');
const judgmentText = document.getElementById('judgment-text');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const targets = [
    document.getElementById('target-0'),
    document.getElementById('target-1'),
    document.getElementById('target-2')
];

let isPlaying = false;
let score = 0;
let combo = 0;
let maxCombo = 0;
let notes = []; // active notes
let speed = 5; // pixels per frame
let noteSpawnRate = 1000; // ms
let lastSpawnTime = 0;

let gauge = 0;
const maxGauge = 100;
let isFever = false;
const bgm = document.getElementById('bgm');
let BPM = 120; // 好きな曲のBPMに合わせて変更してください
let beatInterval = (60 / BPM) * 1000;

let perfectInc = 2;
let greatInc = 1;
let missDec = 3;

let difficulty = 'easy';
let minGap = 0.5;
let maxGap = 1.5;

function setDifficultySettings(diff) {
    if (diff === 'easy') {
        speed = 3;
        minGap = 0.8;
    } else if (diff === 'normal') {
        speed = 5;
        minGap = 0.3;
    } else if (diff === 'hard') {
        speed = 8;
        minGap = 0.12;
    } else if (diff === 'hell') {
        speed = 12;
        minGap = 0.05;
    }
}

const musicUpload = document.getElementById('music-upload');
const selectedSongNameEl = document.getElementById('selected-song-name');
let currentSongName = 'デフォルト曲';
let generatedBeatmap = [];
let beatmapIndex = 0;

let isPaused = false;
const pauseBtn = document.getElementById('pause-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const retryBtn = document.getElementById('retry-btn');
const homeBtn = document.getElementById('home-btn');

if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        if (!isPlaying || isPaused) return;
        isPaused = true;
        bgm.pause();
        pauseOverlay.style.display = 'flex';
    });
}
if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
        isPaused = false;
        pauseOverlay.style.display = 'none';
        bgm.play();
        lastSpawnTime = performance.now();
        requestAnimationFrame(gameLoop);
    });
}
if (retryBtn) {
    retryBtn.addEventListener('click', () => {
        isPaused = false;
        pauseOverlay.style.display = 'none';
        startGame();
    });
}
if (homeBtn) {
    homeBtn.addEventListener('click', () => {
        isPaused = false;
        isPlaying = false;
        bgm.pause();
        bgm.currentTime = 0;
        pauseOverlay.style.display = 'none';
        startOverlay.style.display = 'flex';
        document.getElementById('result-screen').style.display = 'none';
    });
}
const defaultSongSelect = document.getElementById('default-song-select');
if (defaultSongSelect) {
    defaultSongSelect.addEventListener('change', async (e) => {
        const url = e.target.value;
        if (!url) return;
        
        currentSongName = defaultSongSelect.options[defaultSongSelect.selectedIndex].text;
        selectedSongNameEl.innerText = "解析中... (" + currentSongName + ")";
        
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            analyzeAudioBuffer(audioBuffer);
            
            selectedSongNameEl.innerText = currentSongName;
            bgm.src = url;
            
            // ファイルアップロード側をクリア
            if (musicUpload) musicUpload.value = '';
        } catch (err) {
            selectedSongNameEl.innerText = "解析失敗: " + currentSongName;
            console.error(err);
        }
    });
}

if (musicUpload) {
    const uploadBtnLabel = document.querySelector('label[for="music-upload"]');
    musicUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            currentSongName = file.name;
            selectedSongNameEl.innerText = "解析中... (" + currentSongName + ")";
            if (uploadBtnLabel) {
                uploadBtnLabel.style.pointerEvents = 'none';
                uploadBtnLabel.style.opacity = '0.5';
            }
            
            // デフォルト音源の選択をリセット
            if (defaultSongSelect) defaultSongSelect.value = '';
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                if (audioCtx.state === 'suspended') await audioCtx.resume();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                
                analyzeAudioBuffer(audioBuffer);
                
                selectedSongNameEl.innerText = currentSongName;
                const objectURL = URL.createObjectURL(file);
                bgm.src = objectURL;
            } catch (err) {
                selectedSongNameEl.innerText = "解析失敗: " + currentSongName;
                console.error(err);
            }
            
            if (uploadBtnLabel) {
                uploadBtnLabel.style.pointerEvents = 'auto';
                uploadBtnLabel.style.opacity = '1';
            }
        }
    });
}

function analyzeAudioBuffer(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const blockSize = Math.floor(sampleRate / 10); // 100ms blocks
    
    let peaks = [];
    for (let i = 0; i < channelData.length; i += blockSize) {
        let sum = 0;
        for (let j = 0; j < blockSize && i + j < channelData.length; j++) {
            sum += channelData[i + j] * channelData[i + j];
        }
        peaks.push({ time: i / sampleRate, rms: Math.sqrt(sum / blockSize) });
    }
    
    // 動的しきい値（ローカル解析）
    let localPeaks = [];
    const windowSize = 10; // 前後1秒（100ms * 10ブロック）の平均を取る
    
    for (let i = 1; i < peaks.length - 1; i++) {
        let start = Math.max(0, i - windowSize);
        let end = Math.min(peaks.length - 1, i + windowSize);
        let sum = 0;
        for (let j = start; j <= end; j++) {
            sum += peaks[j].rms;
        }
        let localAvg = sum / (end - start + 1);
        let threshold = localAvg * 1.2; // 1.5から1.2に下げて細かい音も拾いやすくする
        
        // 完全に無音のノイズを拾わないよう最低限の絶対値も条件に入れる（0.01 -> 0.005）
        if (peaks[i].rms > threshold && peaks[i].rms > 0.005 && 
            peaks[i].rms > peaks[i-1].rms && peaks[i].rms > peaks[i+1].rms) {
            localPeaks.push(peaks[i].time);
        }
    }
    window.rawAudioPeaks = localPeaks;
}

// ランキング読み込み
function loadRanking() {
    const list = document.getElementById('ranking-list');
    if (!list) return;
    let rankings = JSON.parse(localStorage.getItem('rhythmRankings') || '[]');
    list.innerHTML = '';
    if (rankings.length === 0) {
        list.innerHTML = '<li>まだ履歴がありません</li>';
        return;
    }
    rankings.forEach((r, i) => {
        let li = document.createElement('li');
        li.innerHTML = `<span class="song">${i+1}. ${r.song}</span><span class="score">${r.score}</span>`;
        list.appendChild(li);
    });
}
loadRanking();

// Audio context for simple SFX
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === 'perfect') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // 高音
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1); // 急激に下がるレーザー音
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'great') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'miss') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.2); // 低音のダウン
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }
}

function startGame() {
    isPlaying = true;
    score = 0;
    combo = 0;
    gauge = 0;
    isFever = false;
    document.getElementById('gauge-bar-fill').style.width = '0%';
    notesContainer.innerHTML = '';
    notes = [];
    beatmapIndex = 0;
    
    const diffSelected = document.querySelector('input[name="difficulty"]:checked');
    if (diffSelected) {
        difficulty = diffSelected.value;
    }
    setDifficultySettings(difficulty);
    
    if (bgm && bgm.duration && !isNaN(bgm.duration)) {
        generatedBeatmap = [];
        let basePeaks = window.rawAudioPeaks;
        
        if (!basePeaks || basePeaks.length === 0) {
            basePeaks = [];
            const intervalSec = 60 / BPM;
            for (let t = 2; t < bgm.duration; t += intervalSec) {
                basePeaks.push(t);
            }
        }
        
        // 1. 最小間隔（minGap）でフィルタリングして密集を防ぐ
        let filteredPeaks = [];
        for (let t of basePeaks) {
            if (t < 1.5) continue; // 開始直後1.5秒はノーツを落とさない
            if (filteredPeaks.length === 0 || t - filteredPeaks[filteredPeaks.length - 1] >= minGap) {
                filteredPeaks.push(t);
            }
        }
        
        // ギャップ補填は廃止し、波形基準を優先
        generatedBeatmap = filteredPeaks;
        
        const expectedNotes = generatedBeatmap.length || 1; // 0除算防止
        perfectInc = 100 / (expectedNotes * 0.8); // 80%のPerfectで100%に到達
        greatInc = perfectInc * 0.5;
        missDec = perfectInc * 2;
    } else {
        perfectInc = 2;
        greatInc = 1;
        missDec = 4;
    }
    
    // Reset BGM and play
    if (bgm) {
        bgm.currentTime = 0;
        bgm.play().catch(e => console.log('BGM play failed:', e));
    }
    
    updateUI();
    startOverlay.style.display = 'none';
    lastSpawnTime = performance.now();
    requestAnimationFrame(gameLoop);
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

startBtn.addEventListener('click', startGame);

if (bgm) {
    bgm.addEventListener('ended', endGame);
}

function endGame() {
    isPlaying = false;
    const resultScreen = document.getElementById('result-screen');
    const resultTitle = resultScreen.querySelector('h1');
    
    let isClear = gauge >= 80; // 80%以上でクリア
    
    if (isClear) {
        resultTitle.innerText = "STAGE CLEAR!";
        resultTitle.style.color = "#ff33cc";
        saveRanking();
    } else {
        resultTitle.innerText = "FAILED...";
        resultTitle.style.color = "#666666";
    }
    
    resultScreen.style.display = 'flex';
    document.getElementById('final-score').innerText = score;
    document.getElementById('final-combo').innerText = maxCombo;
}

function saveRanking() {
    let rankings = JSON.parse(localStorage.getItem('rhythmRankings') || '[]');
    rankings.push({
        song: currentSongName,
        score: score,
        date: new Date().toLocaleDateString()
    });
    rankings.sort((a, b) => b.score - a.score);
    rankings = rankings.slice(0, 10);
    localStorage.setItem('rhythmRankings', JSON.stringify(rankings));
    loadRanking();
}

document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').style.display = 'none';
    startGame();
});

function spawnNote() {
    const laneIndex = Math.floor(Math.random() * 3);
    const noteEl = document.createElement('div');
    noteEl.className = 'note';
    noteEl.dataset.lane = laneIndex;
    
    // Position note based on exact lane center
    const leftPercent = laneIndex === 0 ? 16.66 : laneIndex === 1 ? 50 : 83.33;
    noteEl.style.left = `${leftPercent}%`; 
    
    noteEl.style.top = '0px';
    notesContainer.appendChild(noteEl);
    
    notes.push({
        el: noteEl,
        y: -60,
        lane: laneIndex,
        hit: false
    });
}

function updateUI() {
    scoreEl.innerText = score;
    comboEl.innerText = combo;
    if (combo > 0) {
        comboBox.classList.remove('active');
        void comboBox.offsetWidth; // trigger reflow
        comboBox.classList.add('active');
    }
    const gaugeFill = document.getElementById('gauge-bar-fill');
    if (gaugeFill) gaugeFill.style.width = `${Math.min(100, gauge)}%`;
}

function showJudgment(text, color) {
    judgmentText.innerText = text;
    judgmentText.style.color = color;
    judgmentText.style.animation = 'none';
    void judgmentText.offsetWidth; // trigger reflow
    judgmentText.style.animation = 'popText 0.5s ease-out forwards';
}

function handleInput(laneIndex) {
    if (!isPlaying || isPaused) return;
    
    // Visual feedback for target
    targets[laneIndex].classList.add('hit');
    setTimeout(() => targets[laneIndex].classList.remove('hit'), 100);
    
    // Find lowest unhit note in this lane
    const laneNotes = notes.filter(n => n.lane === laneIndex && !n.hit);
    if (laneNotes.length === 0) return;
    
    const targetNote = laneNotes.reduce((prev, curr) => (prev.y > curr.y) ? prev : curr);
    
    // Calculate distance to judgment line
    // Judgment line bottom is 40px, height is 60px. Center is at bottom 70px.
    // Note is 60x60, origin is top-left. Note center y is targetNote.y + 30.
    // So judgment y for top-left of note is playArea.offsetHeight - 100
    const judgmentY = playArea.offsetHeight - 100; 
    const distance = Math.abs(targetNote.y - judgmentY);
    
    let multiplier = isFever ? 2 : 1;
    
    if (distance < 25) {
        // Perfect
        targetNote.hit = true;
        score += (100 + (combo * 10)) * multiplier;
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        gauge = Math.min(maxGauge, gauge + perfectInc);
        showJudgment('PERFECT!', '#ff33cc');
        playSound('perfect');
        removeNote(targetNote);
    } else if (distance < 50) {
        // Great
        targetNote.hit = true;
        score += (50 + (combo * 5)) * multiplier;
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        gauge = Math.min(maxGauge, gauge + greatInc);
        showJudgment('GREAT!', '#ff9933');
        playSound('great');
        removeNote(targetNote);
    } else if (distance < 100) {
        // Bad / Miss
        targetNote.hit = true;
        combo = 0;
        gauge = Math.max(0, gauge - missDec);
        showJudgment('MISS', '#999999');
        playSound('miss');
        removeNote(targetNote);
    }
    
    if (gauge >= 100 && !isFever) {
        triggerFever();
    }
    
    updateUI();
}

function triggerFever() {
    isFever = true;
    const feverOverlay = document.getElementById('fever-overlay');
    feverOverlay.style.display = 'block';
    updateUI();
    
    setTimeout(() => {
        feverOverlay.style.display = 'none';
        isFever = false;
        // ゲージはリセットせず、そのまま（Missで減るまでは100%を維持）
    }, 10000); // 10秒間フィーバー
}

function removeNote(noteObj) {
    if (noteObj.el && noteObj.el.parentNode) {
        noteObj.el.parentNode.removeChild(noteObj.el);
    }
    notes = notes.filter(n => n !== noteObj);
}

function gameLoop(timestamp) {
    if (!isPlaying || isPaused) return;
    requestAnimationFrame(gameLoop);
    
    const judgmentY = playArea.offsetHeight - 100; 
    const fallTime = (judgmentY + 60) / (speed * 60); // ノーツが落ちるのにかかる秒数（60FPS想定）
    
    // Spawn notes based on generatedBeatmap
    if (bgm && bgm.duration > 0 && !bgm.paused) {
        let currentAudioTime = bgm.currentTime;
        while (beatmapIndex < generatedBeatmap.length) {
            let hitTime = generatedBeatmap[beatmapIndex];
            if (currentAudioTime >= hitTime - fallTime) {
                spawnNote();
                beatmapIndex++;
            } else {
                break;
            }
        }
    } else {
        // Fallback if no audio
        if (timestamp - lastSpawnTime > noteSpawnRate) {
            spawnNote();
            lastSpawnTime = timestamp;
            if (noteSpawnRate > 400) noteSpawnRate -= 5;
        }
    }
    
    // Move notes
    for (let i = notes.length - 1; i >= 0; i--) {
        let note = notes[i];
        if (!note.hit) {
            note.y += speed;
            note.el.style.transform = `translate(-50%, ${note.y}px)`; // Keep centering while moving
            
            // Check for miss (fell past the bottom)
            if (note.y > judgmentY + 80) {
                note.hit = true;
                combo = 0;
                gauge = Math.max(0, gauge - missDec);
                showJudgment('MISS', '#999999');
                playSound('miss');
                updateUI();
                removeNote(note);
            }
        }
    }
}

// Input Handling
let secretCode = ['h', 'e', 'l', 'l'];
let secretIndex = 0;

window.addEventListener('keydown', (e) => {
    // 隠しコマンド判定 (HELL)
    if (startOverlay.style.display !== 'none') {
        if (e.key.toLowerCase() === secretCode[secretIndex]) {
            secretIndex++;
            if (secretIndex === secretCode.length) {
                const hellLabel = document.getElementById('hell-label');
                if (hellLabel) {
                    hellLabel.style.display = 'inline-block';
                    document.body.classList.add('hell-unlocked'); // 画面崩れエフェクト開始
                    
                    // グリッチノイズ再生
                    const duration = 0.5;
                    const noiseNodes = [];
                    for(let i=0; i<5; i++) {
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
                        osc.frequency.setValueAtTime(Math.random() * 500 + 50, audioCtx.currentTime);
                        osc.frequency.exponentialRampToValueAtTime(Math.random() * 2000 + 500, audioCtx.currentTime + duration);
                        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.start();
                        osc.stop(audioCtx.currentTime + duration);
                    }

                    setTimeout(() => {
                        document.body.classList.remove('hell-unlocked');
                        document.getElementById('game-container').style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.2)';
                    }, 2000); // 2秒間地獄を味わわせる
                }
                secretIndex = 0;
            }
        } else {
            secretIndex = 0;
        }
    }

    if (e.key === 'ArrowLeft') {
        handleInput(0);
        document.getElementById('btn-left')?.classList.add('active');
    } else if (e.key === 'ArrowDown') {
        handleInput(1);
        document.getElementById('btn-down')?.classList.add('active');
    } else if (e.key === 'ArrowRight') {
        handleInput(2);
        document.getElementById('btn-right')?.classList.add('active');
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') document.getElementById('btn-left')?.classList.remove('active');
    if (e.key === 'ArrowDown') document.getElementById('btn-down')?.classList.remove('active');
    if (e.key === 'ArrowRight') document.getElementById('btn-right')?.classList.remove('active');
});

// Mobile Controls
document.getElementById('btn-left').addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(0); });
document.getElementById('btn-down').addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(1); });
document.getElementById('btn-right').addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(2); });
