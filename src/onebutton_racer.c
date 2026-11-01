/*  ONE-BUTTON RACING  v9  -----------------------------------------------
 *  1.44MB 게임 개발공모전 출품용 프로토타입
 *
 *  조작:  SPACE 하나만 사용.
 *         누르고 있으면 우측으로, 떼면 좌측으로 조향. (원버튼)
 *         차는 속도 0에서 출발 → 약 5초에 100km/h → 이후 천천히 최고속까지.
 *  규칙:  코스를 벗어나거나 콘 게이트에 부딪히면 크래시. 즉시 재시작.
 *         게이트는 450m 지점부터 등장하며, 갈수록 촘촘해지고 구멍이 좁아진다.
 *  점수:  거리 1m = 1점. 여기에 니어미스(구멍 가장자리를 스치듯 통과) 보너스가
 *         붙고, 연속 니어미스는 콤보 배수로 커진다. 안전하게 통과하면 콤보 리셋.
 *         → "멀리 가기"와 "붙여서 가기" 사이의 선택이 매 게이트마다 발생.
 *  연출:  주행거리에 따라 낮 → 노을 → 밤 → 새벽 팔레트가 순환한다.
 *  트랙:  세그먼트 배열을 순환 인덱싱해 무한히 이어진다(끝나는 지점 없음).
 *
 *  리소스 파일 0개 — 전부 절차적 생성. 실행파일 단독으로 1.44MB 이하.
 * ---------------------------------------------------------------------- */
#include "raylib.h"
#include "rlgl.h"
#include <math.h>
#include <stdlib.h>
#include <stdio.h>

#define W 960
#define H 540
#define SEG_LEN 200.0f
#define ROAD_W 2000.0f
#define CAM_HEIGHT 1000.0f
#define CAM_DEPTH 0.84f
#define DRAW_DIST 240
#define N_SEG 12000                /* 트랙 한 바퀴. 순환하므로 주행은 무한   */
#define SEGI(i) ((i) % N_SEG)      /* 순환 인덱스                            */

#define START_SPEED 0.0f
#define CRUISE 5000.0f
#define MAX_SPEED 13000.0f
#define ACCEL_FAST 1000.0f
#define ACCEL_SLOW 180.0f
#define KMH 0.02f
#define STEER 4.2f
#define CENTRIFUGAL 0.30f

#define FIRST_CONE_M 450
/* 콘 게이트: 도로를 가로지르는 콘 줄 + 한쪽 통과 구멍.
   배치는 최고 밀도로 미리 깔아두고, 실제 표시 여부와 구멍 크기는
   런타임에 "그 게이트의 주행거리"로 결정한다 → 몇 바퀴를 돌든 난이도가 이어짐 */
#define G_RAMP 5000.0f
#define G_GAP1 55.0f   /* 최고 난이도 간격(배치 기준)                        */
#define G_DENS0 0.32f  /* 초반 표시 비율. 55/175 → 초반 체감 간격 약 175m    */
#define G_GW0 0.46f
#define G_GW1 0.20f
#define G_MAG0 0.25f
#define G_MAG1 0.55f
#define G_ALT 0.80f

static float segCurve[N_SEG];
static float segY[N_SEG];
static float gateX[N_SEG]; /* 구멍 방향*지터(-1.1..1.1). 9.0f = 게이트 없음 */
static float gateW[N_SEG]; /* 구멍 폭 지터(0.9..1.1)                        */

typedef enum
{
    TITLE,
    PLAY
} State;
static State state = TITLE;
static int hasPlayed = 0;
static float crashFlash = 0;

static float pos, playerX, speed, totalDist, bestDist, lastDist;
static int isRecord, prevAbs;
static unsigned int runCounter = 0;

/* ---- 점수/콤보 ---------------------------------------------------------- */
#define NEAR_T 0.50f      /* 구멍 반폭의 이 비율보다 바깥으로 통과 = 니어미스 */
#define NEAR_BONUS 12.0f  /* 니어미스 기본 점수                              */
#define COMBO_STEP 0.15f  /* 콤보 1당 배수 증가                              */
#define COMBO_MAXMUL 3.0f /* 배수 상한                                       */
static float score, bestScore, lastScore;
static int combo, bestCombo, lastCombo;
static float popT = 0;    /* 니어미스 팝업 잔여시간                          */
static int popPts, popCombo;
static float nearGlow = 0;

/* ---- 오디오: 메인스레드가 쓰고 오디오스레드가 읽는 공유 상태 ---------- */
static volatile float sndSpeedFrac = 0; /* 0..1 엔진 피치/볼륨          */
static volatile float sndDrift = 0;     /* 0..1 드리프트 노이즈 세기     */
static volatile int sndEngineOn = 0;    /* 엔진음 on/off                 */
#define SND_SR 22050

/* ---- 폴리시: 스피드 이펙트 + 타격감 튜닝 ------------------------------- */
#define SHAKE_SPEED_PX 2.0f  /* 고속 상시 진동 최대(px)                   */
#define SHAKE_CRASH_PX 15.0f /* 크래시 흔들림 최대(px)                    */
#define CRASH_HOLD 0.5f      /* 크래시 순간 프리즈 시간(s)                */
#define SLINE_ON 0.30f       /* 이 속도비율 넘으면 스피드라인 등장        */
#define SLINE_MAXR 680.0f    /* 스피드라인이 사라지는 반경               */
static float trauma = 0, flash = 0, crashHold = 0;
#define PCOUNT 40
static struct
{
    float x, y, vx, vy, life, max;
    int on;
} part[PCOUNT];
#define SLINES 30
static struct
{
    float ang, r, spd;
} sline[SLINES];

/* ---- 시간대 팔레트: 낮 → 노을 → 밤 → 새벽 순환 ------------------------- */
#define PHASE_M 3500.0f /* 한 시간대가 지속되는 거리(m)                     */
static const Color PH_SKY[4] = {{90, 150, 210, 255},
                                {250, 140, 90, 255},
                                {14, 18, 40, 255},
                                {120, 124, 190, 255}};
static const Color PH_TINT[4] = {{255, 255, 255, 255},
                                 {255, 186, 146, 255},
                                 {110, 132, 200, 255},
                                 {198, 190, 222, 255}};
static const float PH_AMB[4] = {1.00f, 0.90f, 0.40f, 0.72f};

static unsigned int rngState;
static float rnd(void)
{
    rngState = rngState * 1103515245u + 12345u;
    return (float)((rngState >> 16) & 0x7fff) / 32767.0f;
}

/* 세그먼트 인덱스 → 안정적인 0..1 난수. 게이트 생략 판정에 사용(랩마다 동일) */
static unsigned int hashu(unsigned int x)
{
    x ^= x >> 16;
    x *= 0x7feb352du;
    x ^= x >> 15;
    x *= 0x846ca68bu;
    x ^= x >> 16;
    return x;
}
static float rank01(int s) { return (float)(hashu((unsigned int)s) >> 8) / 16777216.0f; }

static void buildWorld(void)
{
    rngState = (unsigned)(GetTime() * 1000.0) ^ (runCounter * 2654435761u) ^ 0x9E3779B9u;
    runCounter++;

    int i = 0;
    float y = 0;
    while (i < N_SEG)
    {
        int len = 25 + (int)(rnd() * 45);
        float c = 0, r = rnd();
        if (r > 0.45f)
            c = (rnd() * 6.0f + 1.0f) * (rnd() < 0.5f ? -1 : 1);
        float hill = (rnd() * 2.0f - 1.0f) * 800.0f;
        for (int k = 0; k < len && i < N_SEG; k++, i++)
        {
            float distM = (i * SEG_LEN) / 100.0f;
            float diff = distM < 400.0f    ? 0.35f
                         : distM < 1500.0f ? 0.35f + (distM - 400.0f) / 1100.0f * 0.65f
                                           : 1.0f;
            float t = (float)k / len;
            segCurve[i] = c * diff;
            segY[i] = y + hill * (0.5f - 0.5f * cosf(t * PI));
        }
        y += hill;
    }
    for (int k = 0; k < 20; k++)
        segCurve[k] = 0; /* 이음매는 직선으로 */

    /* 언덕 높이를 선형 보정해 끝 == 시작(0)로 맞춘다 → 순환해도 단차 없음 */
    {
        float endY = segY[N_SEG - 1];
        for (int j = 0; j < N_SEG; j++)
            segY[j] -= endY * (float)j / (float)(N_SEG - 1);
    }

    /* 게이트를 최고 밀도로 전 구간에 배치. 표시 여부는 런타임에 결정 */
    for (int j = 0; j < N_SEG; j++)
    {
        gateX[j] = 9.0f;
        gateW[j] = 0.0f;
    }
    float trackM = N_SEG * SEG_LEN / 100.0f;
    float d = 60.0f;
    int side = (rnd() < 0.5f ? 1 : -1);
    while (d < trackM - 40.0f)
    {
        if (rnd() < G_ALT)
            side = -side;
        else
            side = (rnd() < 0.5f ? 1 : -1);
        int seg = (int)(d * 100.0f / SEG_LEN);
        if (seg > 0 && seg < N_SEG)
        {
            gateX[seg] = side * (0.8f + rnd() * 0.3f);
            gateW[seg] = 0.9f + rnd() * 0.2f;
        }
        d += G_GAP1 * (0.85f + rnd() * 0.3f);
    }
}

/* ---- 게이트 난이도: 절대 세그먼트(=주행거리)로만 결정 ------------------ */
static float gateProg(int absSeg)
{
    float p = ((absSeg * SEG_LEN / 100.0f) - FIRST_CONE_M) / G_RAMP;
    if (p < 0)
        p = 0;
    if (p > 1)
        p = 1;
    return p;
}
/* 게이트가 실제로 존재하면 1과 함께 구멍 중심/반폭을 채워준다 */
static int gateAt(int absSeg, float *hx, float *hw)
{
    int gi = SEGI(absSeg);
    if (gateX[gi] > 2.0f)
        return 0; /* 배치 자체가 없음 */
    if ((absSeg * SEG_LEN / 100.0f) < FIRST_CONE_M)
        return 0; /* 출발 직후 유예구간 */
    float prog = gateProg(absSeg);
    if (rank01(gi) >= G_DENS0 + (1.0f - G_DENS0) * prog)
        return 0; /* 난이도상 아직 생략되는 게이트 */
    *hx = gateX[gi] * (G_MAG0 + (G_MAG1 - G_MAG0) * prog);
    *hw = gateW[gi] * (G_GW0 + (G_GW1 - G_GW0) * prog);
    return 1;
}

typedef struct
{
    float sx, sy, sw, camz;
} Proj;
static Proj project(float z, float wy, float camX, float camY, float camZ)
{
    Proj p;
    p.camz = z - camZ;
    float s = CAM_DEPTH / (p.camz == 0 ? 0.0001f : p.camz);
    p.sx = W * 0.5f + (s * (-camX) * W * 0.5f);
    p.sy = H * 0.5f - (s * (wy - camY) * H * 0.5f);
    p.sw = s * ROAD_W * W * 0.5f;
    return p;
}
static void quad(float x1, float y1, float w1, float x2, float y2, float w2, Color c)
{
    Vector2 a = {x2 - w2, y2}, b = {x1 - w1, y1}, cc = {x2 + w2, y2}, d = {x1 + w1, y1};
    DrawTriangleStrip((Vector2[]){a, b, cc, d}, 4, c);
}

static void resetRun(void)
{
    pos = 0;
    playerX = 0;
    speed = START_SPEED;
    totalDist = 0;
    isRecord = 0;
    prevAbs = 0;
    score = 0;
    combo = 0;
    popT = 0;
    nearGlow = 0;
    buildWorld();
}

/* ---- 흔들림용 간이 난수(-1..1) ---------------------------------------- */
static float shrnd(void) { return GetRandomValue(-1000, 1000) / 1000.0f; }

/* ---- 콘 파편 생성 ------------------------------------------------------ */
static void spawnDebris(float cx, float cy)
{
    int n = 0;
    for (int i = 0; i < PCOUNT && n < 22; i++)
    {
        float ang = GetRandomValue(0, 628) / 100.0f;
        float spd = GetRandomValue(120, 460);
        part[i].on = 1;
        part[i].x = cx + GetRandomValue(-24, 24);
        part[i].y = cy + GetRandomValue(-10, 10);
        part[i].vx = cosf(ang) * spd;
        part[i].vy = -(float)GetRandomValue(160, 560); /* 위로 솟구침 */
        part[i].max = 0.45f + GetRandomValue(0, 45) / 100.0f;
        part[i].life = part[i].max;
        n++;
    }
}

#define SKY (Color){90, 150, 210, 255}
#define GRASS_D (Color){24, 120, 48, 255}
#define GRASS_L (Color){30, 140, 58, 255}
#define ROAD_D (Color){68, 68, 72, 255}
#define ROAD_L (Color){84, 84, 88, 255}
#define RUM_D (Color){190, 40, 40, 255}
#define RUM_L (Color){235, 235, 235, 255}
#define LANE (Color){230, 230, 230, 255}
#define CONE (Color){255, 140, 20, 255}

/* ---- 팔레트 보조 ------------------------------------------------------- */
static Color lerpC(Color a, Color b, float t)
{
    return (Color){(unsigned char)(a.r + (b.r - a.r) * t), (unsigned char)(a.g + (b.g - a.g) * t),
                   (unsigned char)(a.b + (b.b - a.b) * t), 255};
}
static Color shade(Color b, Color tint, float amb)
{
    float r = (float)b.r * ((float)tint.r / 255.0f) * amb;
    float g = (float)b.g * ((float)tint.g / 255.0f) * amb;
    float bl = (float)b.b * ((float)tint.b / 255.0f) * amb;
    if (r > 255)
        r = 255;
    if (g > 255)
        g = 255;
    if (bl > 255)
        bl = 255;
    return (Color){(unsigned char)r, (unsigned char)g, (unsigned char)bl, b.a};
}

/* ---- 엔진+드리프트 실시간 합성 콜백 (오디오 스레드에서 호출) ---------- */
static void audioCB(void *buffer, unsigned int frames)
{
    short *out = (short *)buffer;
    static float phase = 0;
    static unsigned int ns = 0x1234abcd; /* 노이즈용 LCG                */
    float sf = sndSpeedFrac;
    float baseHz = 55.0f + sf * 205.0f; /* 속도 따라 피치 상승          */
    float engVol = sndEngineOn ? (0.10f + sf * 0.22f) : 0.0f;
    float drift = sndDrift;
    for (unsigned int i = 0; i < frames; i++)
    {
        phase += baseHz / (float)SND_SR;
        if (phase >= 1.0f)
            phase -= 1.0f;
        float saw = phase * 2.0f - 1.0f;          /* 톱니(버즈)                  */
        float sq = (phase < 0.5f) ? -1.0f : 1.0f; /* 사각(바디)                  */
        float eng = (saw * 0.5f + sq * 0.5f) * engVol;
        ns = ns * 1103515245u + 12345u; /* 화이트노이즈                */
        float noise = ((float)((ns >> 16) & 0x7fff) / 16383.5f - 1.0f);
        float s = eng + noise * drift * 0.28f;
        if (s > 1.0f)
            s = 1.0f;
        if (s < -1.0f)
            s = -1.0f;
        out[i] = (short)(s * 30000.0f);
    }
}

int main(void)
{
    SetConfigFlags(FLAG_VSYNC_HINT | FLAG_MSAA_4X_HINT);
    InitWindow(W, H, "ONE-BUTTON RACING");
    SetTargetFPS(60);
    rlDisableBackfaceCulling();

    /* ---- 오디오 초기화 ---- */
    InitAudioDevice();
    /* 크래시(폭발)음: 노이즈 버스트를 코드로 생성 */
    int cn = SND_SR * 0.6f;
    short *cbuf = (short *)MemAlloc(cn * sizeof(short));
    unsigned int cs = 0x9e3779b9u;
    for (int i = 0; i < cn; i++)
    {
        float env = 1.0f - (float)i / cn;
        env = env * env; /* 감쇠            */
        cs = cs * 1103515245u + 12345u;
        float nz = ((float)((cs >> 16) & 0x7fff) / 16383.5f - 1.0f);
        cbuf[i] = (short)(nz * env * 0.7f * 32000.0f);
    }
    Wave cw = {(unsigned int)cn, SND_SR, 16, 1, cbuf};
    Sound crashSnd = LoadSoundFromWave(cw);
    MemFree(cbuf);

    /* 게이트 통과음: 짧은 "틱/휙". 톤+노이즈를 빠르게 감쇠 */
    int pn = (int)(SND_SR * 0.10f);
    short *pbuf = (short *)MemAlloc(pn * sizeof(short));
    unsigned int ps2 = 0x51ed270bu;
    for (int i = 0; i < pn; i++)
    {
        float e = 1.0f - (float)i / pn;
        e = e * e * e; /* 아주 빠른 감쇠  */
        float tone = sinf(2.0f * PI * 520.0f * (float)i / (float)SND_SR);
        ps2 = ps2 * 1103515245u + 12345u;
        float nz = ((float)((ps2 >> 16) & 0x7fff) / 16383.5f - 1.0f);
        pbuf[i] = (short)((tone * 0.55f + nz * 0.45f) * e * 26000.0f);
    }
    Wave pw = {(unsigned int)pn, SND_SR, 16, 1, pbuf};
    Sound passSnd = LoadSoundFromWave(pw);
    MemFree(pbuf);

    /* 엔진+드리프트 실시간 스트림 */
    AudioStream eng = LoadAudioStream(SND_SR, 16, 1);
    SetAudioStreamCallback(eng, audioCB);
    PlayAudioStream(eng);

    buildWorld();
    bestDist = 0;
    bestScore = 0;

    float odX[DRAW_DIST], odY[DRAW_DIST], odW[DRAW_DIST];
    float odGX[DRAW_DIST], odGW[DRAW_DIST];
    int odN;

    /* 스피드라인 초기화(소실점에서 방사형) */
    for (int i = 0; i < SLINES; i++)
    {
        sline[i].ang = GetRandomValue(0, 628) / 100.0f;
        sline[i].r = GetRandomValue(20, (int)SLINE_MAXR);
        sline[i].spd = 0.7f + GetRandomValue(0, 60) / 100.0f;
    }

    while (!WindowShouldClose())
    {
        float dt = GetFrameTime();
        if (dt > 0.05f)
            dt = 0.05f;
        int btn = IsKeyDown(KEY_SPACE);

        if (state == TITLE)
        {
            sndEngineOn = 0;
            sndDrift = 0; /* 타이틀: 엔진 정지 */
            if (crashFlash > 0)
            {
                crashFlash -= dt;
                if (crashFlash < 0)
                    crashFlash = 0;
            }
            if (IsKeyPressed(KEY_SPACE))
            {
                resetRun();
                state = PLAY;
                hasPlayed = 1;
            }
        }
        else if (crashHold > 0)
        { /* 크래시 프리즈(타격감 강조) */
            crashHold -= dt;
            sndEngineOn = 0;
            sndDrift = 0;
            if (crashHold <= 0)
            {
                state = TITLE;
                crashFlash = 0.7f;
            }
        }
        else
        {
            if (speed < CRUISE)
                speed += ACCEL_FAST * dt;
            else
                speed += ACCEL_SLOW * dt;
            if (speed > MAX_SPEED)
                speed = MAX_SPEED;
            float sf = speed / MAX_SPEED;

            pos += speed * dt;
            totalDist = pos;
            score += speed * dt / 100.0f; /* 거리 1m = 1점 */
            int segA = (int)(pos / SEG_LEN);
            int segM = SEGI(segA);

            playerX += (btn ? STEER : -STEER) * sf * dt;
            playerX -= segCurve[segM] * sf * CENTRIFUGAL * dt;

            int crashed = 0;
            if (playerX < -1.0f || playerX > 1.0f)
                crashed = 1;

            int curAbs = segA;
            if (!crashed)
            {
                for (int s = prevAbs + 1; s <= curAbs; s++)
                {
                    float hx, hw;
                    if (!gateAt(s, &hx, &hw))
                        continue;
                    float off = fabsf(playerX - hx);
                    if (off > hw)
                    {
                        crashed = 1;
                        break;
                    }
                    /* ---- 통과 성공: 가장자리에 붙을수록 니어미스 ---- */
                    float tight = off / hw; /* 0=한복판, 1=콘을 스침 */
                    if (tight > NEAR_T)
                    {
                        combo++;
                        if (combo > bestCombo)
                            bestCombo = combo;
                        float mul = 1.0f + combo * COMBO_STEP;
                        if (mul > COMBO_MAXMUL)
                            mul = COMBO_MAXMUL;
                        float bonus = NEAR_BONUS * mul * (0.6f + tight * 0.4f);
                        score += bonus;
                        popPts = (int)bonus;
                        popCombo = combo;
                        popT = 0.85f;
                        nearGlow = 1.0f;
                        trauma += 0.16f; /* 살짝 찌릿한 손맛 */
                        if (trauma > 1.0f)
                            trauma = 1.0f;
                        SetSoundPitch(passSnd, 1.15f + tight * 0.75f + combo * 0.02f);
                        SetSoundVolume(passSnd, 0.55f + tight * 0.45f);
                    }
                    else
                    {
                        combo = 0; /* 안전하게 통과 = 콤보 끊김 */
                        SetSoundPitch(passSnd, 0.80f);
                        SetSoundVolume(passSnd, 0.22f);
                    }
                    PlaySound(passSnd);
                }
            }
            prevAbs = curAbs;
            isRecord = (score > bestScore);

            /* ---- 오디오 상태 갱신 ---- */
            sndEngineOn = 1;
            sndSpeedFrac = sf;
            {
                float d = fabsf(segCurve[segM]) * sf * 0.16f + fabsf(playerX) * sf * 0.7f;
                if (d > 1.0f)
                    d = 1.0f;
                sndDrift = d;
            }

            if (crashed)
            {
                lastDist = totalDist;
                lastScore = score;
                lastCombo = combo;
                if (totalDist > bestDist)
                    bestDist = totalDist;
                if (score > bestScore)
                    bestScore = score;
                combo = 0;
                crashHold = CRASH_HOLD; /* 프리즈 시작 */
                trauma = 1.0f;
                flash = 1.0f;                  /* 흔들림+플래시 */
                spawnDebris(W * 0.5f, H - 70); /* 파편 */
                PlaySound(crashSnd);
                sndEngineOn = 0;
                sndDrift = 0;
            }
        }

        /* ---- 폴리시 상태 감쇠 + 파편 업데이트 (매 프레임) ---- */
        if (trauma > 0)
        {
            trauma -= dt * 1.7f;
            if (trauma < 0)
                trauma = 0;
        }
        if (flash > 0)
        {
            flash -= dt / 0.18f;
            if (flash < 0)
                flash = 0;
        }
        if (popT > 0)
        {
            popT -= dt;
            if (popT < 0)
                popT = 0;
        }
        if (nearGlow > 0)
        {
            nearGlow -= dt / 0.25f;
            if (nearGlow < 0)
                nearGlow = 0;
        }
        for (int i = 0; i < PCOUNT; i++)
        {
            if (part[i].on)
            {
                part[i].life -= dt;
                if (part[i].life <= 0)
                {
                    part[i].on = 0;
                }
                else
                {
                    part[i].x += part[i].vx * dt;
                    part[i].y += part[i].vy * dt;
                    part[i].vy += 900.0f * dt; /* 중력 */
                }
            }
        }
        /* 스피드라인: 소실점에서 바깥으로 가속하며 뻗어나감 */
        {
            float slf = (state == PLAY && crashHold <= 0) ? speed / MAX_SPEED : 0;
            for (int i = 0; i < SLINES; i++)
            {
                sline[i].r += (60.0f + sline[i].r * (1.0f + slf * 3.5f)) * sline[i].spd * dt;
                if (sline[i].r > SLINE_MAXR)
                {
                    sline[i].r = GetRandomValue(10, 50);
                    sline[i].ang = GetRandomValue(0, 628) / 100.0f;
                    sline[i].spd = 0.7f + GetRandomValue(0, 60) / 100.0f;
                }
            }
        }

        /* ---- 시간대 팔레트 계산(주행거리 기반, 프레임당 1회) ---- */
        Color cSky, cGrassD, cGrassL, cRoadD, cRoadL, cRumD, cRumL, cLane, cCone;
        float amb;
        {
            float ph = fmodf((totalDist / 100.0f) / PHASE_M, 4.0f);
            int a = (int)ph, b = (a + 1) & 3;
            float t = ph - a;
            t = t * t * (3.0f - 2.0f * t); /* 부드러운 전환 */
            cSky = lerpC(PH_SKY[a], PH_SKY[b], t);
            Color tint = lerpC(PH_TINT[a], PH_TINT[b], t);
            amb = PH_AMB[a] + (PH_AMB[b] - PH_AMB[a]) * t;
            cGrassD = shade(GRASS_D, tint, amb);
            cGrassL = shade(GRASS_L, tint, amb);
            cRoadD = shade(ROAD_D, tint, amb);
            cRoadL = shade(ROAD_L, tint, amb);
            cRumD = shade(RUM_D, tint, amb);
            cRumL = shade(RUM_L, tint, amb);
            cLane = shade(LANE, tint, amb);
            /* 콘은 게임플레이 핵심이라 밤에도 잘 보이게 덜 어둡게 */
            cCone = shade(CONE, lerpC(tint, (Color){255, 255, 255, 255}, 0.55f), 0.80f + amb * 0.20f);
        }

        BeginDrawing();
        ClearBackground(cSky);

        /* 화면 흔들림: 크래시 트라우마 + 고속 상시 진동 */
        float sfShake = (state == PLAY && crashHold <= 0) ? speed / MAX_SPEED : 0;
        float ampS = trauma * trauma * SHAKE_CRASH_PX + sfShake * SHAKE_SPEED_PX;
        float shOx = shrnd() * ampS, shOy = shrnd() * ampS;
        rlPushMatrix();
        rlTranslatef(shOx, shOy, 0);

        int base = (int)(pos / SEG_LEN);
        float basePct = fmodf(pos, SEG_LEN) / SEG_LEN;
        int b0 = SEGI(base), b1 = SEGI(base + 1);
        float x = 0, dx = -(segCurve[b0] * basePct);
        float playerY = segY[b0] + (segY[b1] - segY[b0]) * basePct;
        float camY = CAM_HEIGHT + playerY;
        float maxy = H;
        odN = 0;

        for (int n = 0; n < DRAW_DIST; n++)
        {
            int idx = base + n; /* 절대 세그먼트(거리) */
            int mi = SEGI(idx), mi1 = SEGI(idx + 1);
            float camX = playerX * ROAD_W - x;
            Proj p1 = project(idx * SEG_LEN, segY[mi], camX, camY, pos);
            Proj p2 = project((idx + 1) * SEG_LEN, segY[mi1], camX - dx, camY, pos);
            x += dx;
            dx += segCurve[mi];

            if (p1.camz <= CAM_DEPTH)
                continue;
            if (p2.sy >= maxy)
                continue;

            int light = ((idx / 3) % 2) == 0;
            DrawRectangle(0, (int)p2.sy, W, (int)(p1.sy - p2.sy) + 1, light ? cGrassL : cGrassD);
            quad(p1.sx, p1.sy, p1.sw * 1.15f, p2.sx, p2.sy, p2.sw * 1.15f, light ? cRumL : cRumD);
            quad(p1.sx, p1.sy, p1.sw, p2.sx, p2.sy, p2.sw, light ? cRoadL : cRoadD);
            if (light)
                quad(p1.sx, p1.sy, p1.sw * 0.04f, p2.sx, p2.sy, p2.sw * 0.04f, cLane);

            float hx, hw;
            if (gateAt(idx, &hx, &hw) && odN < DRAW_DIST)
            {
                odX[odN] = p1.sx;
                odY[odN] = p1.sy;
                odW[odN] = p1.sw;
                odGX[odN] = hx;
                odGW[odN] = hw;
                odN++;
            }
            maxy = p2.sy;
        }

        /* 게이트: 도로를 가로지르는 콘 줄(구멍 부분만 비움). 먼 것부터 */
        for (int k = odN - 1; k >= 0; k--)
        {
            float sx = odX[k], sy = odY[k], sw = odW[k];
            float gapC = sx + odGX[k] * sw; /* 구멍 중심 화면좌표 */
            float gapHW = odGW[k] * sw;     /* 구멍 반폭 화면좌표 */
            float ow = sw * 0.11f, oh = ow * 1.9f;
            if (ow < 1.2f)
                ow = 1.2f;
            float step = ow * 2.1f;
            for (float px = sx - sw; px <= sx + sw; px += step)
            {
                if (fabsf(px - gapC) < gapHW)
                    continue; /* 구멍은 비움 */
                DrawTriangle((Vector2){px, sy - oh}, (Vector2){px - ow, sy}, (Vector2){px + ow, sy},
                             cCone);
                DrawTriangle((Vector2){px, sy - oh * 0.55f}, (Vector2){px - ow * 0.55f, sy - oh * 0.15f},
                             (Vector2){px + ow * 0.55f, sy - oh * 0.15f}, RAYWHITE);
            }
        }

        {
            float lean = (btn ? 1 : -1) * 14.0f;
            float cx = W * 0.5f + lean, cy = H - 46, cw2 = 78, ch = 46;
            Color body = (crashHold > 0 || (state == TITLE && crashFlash > 0))
                             ? (Color){235, 80, 60, 255}
                             : (Color){235, 210, 60, 255};
            if (nearGlow > 0) /* 니어미스 순간 차체가 번쩍 */
                body = lerpC(body, (Color){255, 255, 255, 255}, nearGlow * 0.75f);
            DrawRectangle((int)(cx - cw2 / 2), (int)(cy - ch), (int)cw2, (int)ch, body);
            DrawRectangle((int)(cx - cw2 * 0.30f), (int)(cy - ch * 0.85f), (int)(cw2 * 0.60f),
                          (int)(ch * 0.42f), (Color){40, 60, 90, 255});
            DrawRectangle((int)(cx - cw2 / 2), (int)(cy - 6), (int)cw2, 6, (Color){20, 20, 24, 255});
        }

        /* 콘 파편 (흔들림 매트릭스 안에서) */
        for (int i = 0; i < PCOUNT; i++)
        {
            if (part[i].on)
            {
                float a = part[i].life / part[i].max;
                if (a > 1)
                    a = 1;
                Color pc = (Color){cCone.r, cCone.g, cCone.b, (unsigned char)(a * 255)};
                DrawRectangle((int)part[i].x - 3, (int)part[i].y - 3, 6, 6, pc);
            }
        }

        rlPopMatrix(); /* 흔들림 종료 (HUD/오버레이는 고정) */

        /* 스피드라인 (소실점에서 방사형으로 뻗는 질주선) */
        {
            float slf = (state == PLAY && crashHold <= 0) ? speed / MAX_SPEED : 0;
            if (slf > SLINE_ON)
            {
                float bs = (slf - SLINE_ON) / (1.0f - SLINE_ON); /* 0..1 세기 */
                float cx = W * 0.5f, cy = H * 0.5f;
                for (int i = 0; i < SLINES; i++)
                {
                    float r = sline[i].r;
                    if (r < 75.0f)
                        continue; /* 중앙은 비움(도로 확보) */
                    float dxs = cosf(sline[i].ang), dys = sinf(sline[i].ang);
                    float len = 10.0f + r * 0.22f; /* 바깥일수록 길게 */
                    float rf = r / SLINE_MAXR;     /* 바깥일수록 진하게 */
                    unsigned char a = (unsigned char)(bs * rf * 170.0f);
                    DrawLineEx((Vector2){cx + dxs * r, cy + dys * r},
                               (Vector2){cx + dxs * (r + len), cy + dys * (r + len)},
                               2.0f, (Color){255, 255, 255, a});
                }
            }
        }

        /* 크래시 순간 화이트 플래시 */
        if (flash > 0)
        {
            unsigned char a = (unsigned char)(flash * flash * 170.0f);
            DrawRectangle(0, 0, W, H, (Color){255, 255, 255, a});
        }

        if (state == PLAY)
        {
            DrawText(TextFormat("%d", (int)score), 18, 10, 44, RAYWHITE);
            DrawText(TextFormat("%d m", (int)(totalDist / 100)), 18, 58, 22,
                     (Color){215, 230, 245, 255});
            DrawText(TextFormat("BEST  %d", (int)bestScore), 18, 84, 22, (Color){180, 220, 255, 255});
            DrawText(TextFormat("%d km/h", (int)(speed * KMH)), W - 210, 14, 26, RAYWHITE);
            int dm = (int)(totalDist / 100);
            if (dm < FIRST_CONE_M)
                DrawText(TextFormat("CONES IN %dm", FIRST_CONE_M - dm), W / 2 - 100, H - 56, 22,
                         (Color){255, 235, 150, 190});
            if (isRecord && bestScore > 0)
                DrawText("NEW RECORD!", W / 2 - 110, 20, 30, (Color){255, 230, 90, 255});

            /* 콤보 배지 */
            if (combo > 0)
            {
                const char *ct = TextFormat("x%d", combo);
                int cs2 = 34 + (combo > 8 ? 8 : combo);
                DrawText(ct, W / 2 - MeasureText(ct, cs2) / 2, 62, cs2,
                         (Color){255, 205, 60, 255});
                DrawText("COMBO", W / 2 - MeasureText("COMBO", 16) / 2, 62 + cs2 + 2, 16,
                         (Color){255, 225, 140, 200});
            }
            /* 니어미스 팝업 */
            if (popT > 0)
            {
                float k = popT / 0.85f;
                unsigned char a = (unsigned char)(k * 255);
                const char *nt = TextFormat("NEAR!  +%d", popPts);
                int ny = (int)(H * 0.32f - (1.0f - k) * 34.0f);
                DrawText(nt, W / 2 - MeasureText(nt, 30) / 2, ny, 30, (Color){255, 240, 120, a});
            }
        }
        else
        {
            DrawRectangle(0, 0, W, H, (Color){0, 0, 0, 110});
            if (crashFlash > 0)
                DrawText("CRASH", W / 2 - MeasureText("CRASH", 64) / 2, H / 2 - 150, 64,
                         (Color){255, 90, 70, 255});
            const char *t = "ONE-BUTTON RACING";
            DrawText(t, W / 2 - MeasureText(t, 44) / 2, H / 2 - 70, 44, RAYWHITE);
            if (!hasPlayed)
            {
                const char *c1 = "HOLD SPACE = STEER RIGHT    RELEASE = STEER LEFT";
                DrawText(c1, W / 2 - MeasureText(c1, 22) / 2, H / 2 - 6, 22, (Color){200, 220, 255, 255});
                const char *c2 = "SHAVE THE CONES FOR COMBO BONUS. GO FAR!";
                DrawText(c2, W / 2 - MeasureText(c2, 22) / 2, H / 2 + 26, 22, (Color){200, 220, 255, 255});
            }
            else
            {
                char s1[40], s2[40], s3[40];
                sprintf(s1, "SCORE  %d", (int)lastScore);
                sprintf(s2, "%d m    BEST COMBO x%d", (int)(lastDist / 100), bestCombo);
                sprintf(s3, "BEST   %d", (int)bestScore);
                DrawText(s1, W / 2 - MeasureText(s1, 28) / 2, H / 2 - 10, 28,
                         (Color){255, 235, 150, 255});
                DrawText(s2, W / 2 - MeasureText(s2, 20) / 2, H / 2 + 24, 20,
                         (Color){190, 205, 225, 255});
                DrawText(s3, W / 2 - MeasureText(s3, 24) / 2, H / 2 + 50, 24,
                         (Color){180, 220, 255, 255});
            }
            const char *ps = hasPlayed ? "PRESS  SPACE  TO  RETRY" : "PRESS  SPACE  TO  START";
            if (((int)(GetTime() * 2)) % 2 == 0)
                DrawText(ps, W / 2 - MeasureText(ps, 28) / 2, H / 2 + 90, 28, (Color){255, 230, 90, 255});
        }

        EndDrawing();
    }
    UnloadAudioStream(eng);
    UnloadSound(passSnd);
    UnloadSound(crashSnd);
    CloseAudioDevice();
    CloseWindow();
    return 0;
}
