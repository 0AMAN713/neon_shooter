import React, { useEffect, useRef, useState } from "react";

/*
  GameCanvas.jsx
  - React component that renders a full-screen neon space shooter on a <canvas>.
  - Features:
    * Smooth acceleration / friction movement
    * Dash (Shift) with cooldown & brief invulnerability
    * Mouse-aim + hold-to-fire and keyboard fire (Space)
    * Weapon modes: single, rapid, spread (toggle with Q)
    * Enemies with spawn rate/difficulty ramp
    * Bullets with vx/vy, enemy bullets, collisions
    * Particle system for explosions & muzzle flashes
    * Neon glow via canvas shadow settings
    * HUD (score, shields), pause (P or Esc), restart
  - Drop into src/GameCanvas.jsx and import in App.
*/

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;

export default function GameCanvas() {
  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const dataRef = useRef(null);

  // UI states
  const [running, setRunning] = useState(false); // playing
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [weaponLabel, setWeaponLabel] = useState("single");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);

    // Game data
    const game = {
      startedAt: Date.now(),
      lastEnemySpawn: Date.now(),
      enemySpawnRate: 1800,
      difficultyTimer: Date.now(),
      mouse: null,
      isMouseDown: false,
      keys: {},
      bullets: [],
      enemyBullets: [],
      enemies: [],
      particles: [],
      score: 0,
      lastFrame: Date.now(),
      // player will be set below
    };

    // Player initialization
    const player = {
      x: W / 2,
      y: H - 120,
      width: 40,
      height: 40,
      vx: 0,
      vy: 0,
      maxSpeed: 6,
      accel: 0.8,
      friction: 0.88,
      health: 3,
      invulnerableUntil: 0,
      lastDash: 0,
      dashCooldown: 1200,
      dashSpeed: 18,
      weapon: "single", // 'single' | 'rapid' | 'spread'
      lastShot: 0,
      shootCooldown: 220,
    };
    game.player = player;

    // helpers
    const createParticles = (x, y, color = "#00ffff", count = 12, speed = 3) => {
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(0.5, speed);
        game.particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          size: rand(2, 6),
          color,
          life: rand(30, 80),
          maxLife: rand(30, 80),
        });
      }
    };

    // spawn variety enemy
    const spawnEnemy = () => {
      const size = rand(24, 56);
      const x = rand(20, W - 20 - size);
      const y = -size - 10;
      const speed = rand(0.6, 2.2);
      const type = Math.random() < 0.12 ? "tank" : Math.random() < 0.35 ? "scout" : "fighter";
      const health = type === "tank" ? 4 + Math.floor(size / 20) : type === "scout" ? 1 : 2;
      game.enemies.push({
        x,
        y,
        width: size,
        height: size,
        speed,
        type,
        health,
        lastShot: Date.now(),
        shootCooldown: rand(1200, 3000),
        wiggle: Math.random() * 1.4 - 0.7,
      });
    };

    // collision
    const checkCollision = (a, b) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

    // Input handlers
    const onKeyDown = (e) => {
      game.keys[e.key.toLowerCase()] = true;
      if (e.key === " " || e.code === "Space") e.preventDefault();

      if (e.key.toLowerCase() === "p" || e.key === "Escape") {
        setPaused((p) => {
          const nv = !p;
          if (nv) setRunning(true);
          return nv;
        });
      }

      if (e.key.toLowerCase() === "q") {
        // toggle weapon
        if (player.weapon === "single") player.weapon = "rapid";
        else if (player.weapon === "rapid") player.weapon = "spread";
        else player.weapon = "single";
        setWeaponLabel(player.weapon);
      }
      if (e.key.toLowerCase() === "r") {
        // quick restart
        resetGame();
      }
    };
    const onKeyUp = (e) => {
      game.keys[e.key.toLowerCase()] = false;
    };
    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      game.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMouseDown = (e) => {
      game.isMouseDown = true;
    };
    const onMouseUp = (e) => {
      game.isMouseDown = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // resize
    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      player.x = clamp(player.x, 0, W - player.width);
      player.y = clamp(player.y, 0, H - player.height);
    };
    window.addEventListener("resize", onResize);

    // Shooting
    const playerShoot = () => {
      const now = Date.now();
      const p = player;
      let cooldown = p.shootCooldown;
      if (p.weapon === "rapid") cooldown = 80;
      if (p.weapon === "spread") cooldown = 360;
      if (now - p.lastShot < cooldown) return;
      p.lastShot = now;

      const px = p.x + p.width / 2;
      const py = p.y + p.height / 2;

      const aim = game.mouse ? { x: game.mouse.x - px, y: game.mouse.y - py } : { x: 0, y: -1 };
      const norm = Math.hypot(aim.x, aim.y) || 1;
      const dirX = aim.x / norm;
      const dirY = aim.y / norm;
      const speed = 10;

      const makeBullet = (vx, vy, width = 6, height = 14, color = "#ffff88") => {
        game.bullets.push({
          x: px - width / 2,
          y: py - height / 2,
          vx,
          vy,
          width,
          height,
          color,
        });
      };

      if (p.weapon === "single") {
        makeBullet(dirX * speed, dirY * speed, 6, 14, "#a6ffff");
      } else if (p.weapon === "rapid") {
        makeBullet(dirX * speed, dirY * speed, 5, 12, "#fff4a6");
      } else if (p.weapon === "spread") {
        // three-way spread using small angle offsets
        const baseAngle = Math.atan2(dirY, dirX);
        [-0.25, 0, 0.25].forEach((off) => {
          const a = baseAngle + off;
          makeBullet(Math.cos(a) * speed, Math.sin(a) * speed, 5, 12, "#ffd17a");
        });
      }

      // muzzle flash particles
      createParticles(px + dirX * 12, py + dirY * 12, "#fff8b0", 6, 2.6);
    };

    // enemy shoot
    const enemyShoot = (e) => {
      const px = e.x + e.width / 2;
      const py = e.y + e.height;
      // aim at player center
      const aimX = (player.x + player.width / 2) - px;
      const aimY = (player.y + player.height / 2) - py;
      const norm = Math.hypot(aimX, aimY) || 1;
      const vx = (aimX / norm) * 4.2;
      const vy = (aimY / norm) * 4.2;
      game.enemyBullets.push({
        x: px - 4,
        y: py,
        vx,
        vy,
        width: 6,
        height: 14,
        color: "#ff66cc",
      });
    };

    // Reset / start
    const resetGame = () => {
      game.bullets.length = 0;
      game.enemyBullets.length = 0;
      game.enemies.length = 0;
      game.particles.length = 0;
      game.score = 0;
      player.health = 3;
      player.x = W / 2;
      player.y = H - 120;
      player.vx = 0;
      player.vy = 0;
      player.weapon = "single";
      player.lastShot = 0;
      player.lastDash = 0;
      game.enemySpawnRate = 1800;
      game.lastEnemySpawn = Date.now();
      setScore(0);
      setLives(player.health);
      setWeaponLabel(player.weapon);
      setRunning(true);
      setPaused(false);
    };

    // main update (physics, spawns, collisions)
    const update = () => {
      const now = Date.now();

      // Difficulty ramp
      if (now - game.difficultyTimer > 8000) {
        game.enemySpawnRate = Math.max(600, game.enemySpawnRate - 150);
        game.difficultyTimer = now;
      }

      // Inputs -> movement
      const left = game.keys["a"] || game.keys["arrowleft"];
      const right = game.keys["d"] || game.keys["arrowright"];
      const up = game.keys["w"] || game.keys["arrowup"];
      const down = game.keys["s"] || game.keys["arrowdown"];
      const dashKey = game.keys["shift"] || game.keys["shiftleft"];

      if (left) player.vx -= player.accel;
      if (right) player.vx += player.accel;
      if (up) player.vy -= player.accel;
      if (down) player.vy += player.accel;

      // Dash
      if (dashKey && now - player.lastDash > player.dashCooldown) {
        player.lastDash = now;
        // dash toward mouse if present else upward
        const dx = game.mouse ? game.mouse.x - (player.x + player.width / 2) : 0;
        const dy = game.mouse ? game.mouse.y - (player.y + player.height / 2) : -1;
        const mag = Math.hypot(dx, dy) || 1;
        player.vx += (dx / mag) * player.dashSpeed;
        player.vy += (dy / mag) * player.dashSpeed;
        player.invulnerableUntil = now + 420;
        createParticles(player.x + player.width / 2, player.y + player.height / 2, "#a6ffff", 18, 5);
      }

      // clamp speed
      const spd = Math.hypot(player.vx, player.vy);
      if (spd > player.maxSpeed) {
        const s = player.maxSpeed / spd;
        player.vx *= s;
        player.vy *= s;
      }
      // friction + integrate
      player.vx *= player.friction;
      player.vy *= player.friction;
      player.x += player.vx;
      player.y += player.vy;

      // keep on screen
      player.x = clamp(player.x, 0, W - player.width);
      player.y = clamp(player.y, 0, H - player.height);

      // shooting via keys or mouse
      if (game.keys[" "] || game.isMouseDown) {
        playerShoot();
      }

      // spawn enemies
      if (now - game.lastEnemySpawn > game.enemySpawnRate) {
        spawnEnemy();
        game.lastEnemySpawn = now;
      }

      // update bullets
      game.bullets = game.bullets.filter((b) => {
        b.x += b.vx;
        b.y += b.vy;
        // trail particle occasionally
        if (Math.random() < 0.02) {
          game.particles.push({
            x: b.x,
            y: b.y,
            vx: -b.vx * 0.1 + rand(-0.6, 0.6),
            vy: -b.vy * 0.1 + rand(-0.6, 0.6),
            size: 1.5,
            color: "#ffffc4",
            life: 20,
            maxLife: 20,
          });
        }
        return b.x > -50 && b.x < W + 50 && b.y > -50 && b.y < H + 50;
      });

      // update enemy bullets
      game.enemyBullets = game.enemyBullets.filter((b) => {
        b.x += b.vx;
        b.y += b.vy;
        return b.x > -50 && b.x < W + 50 && b.y > -50 && b.y < H + 50;
      });

      // update enemies
      game.enemies = game.enemies.filter((e) => {
        // simple downward movement with wiggle
        e.y += e.speed;
        e.x += Math.sin((Date.now() + e.wiggle * 1000) / 400) * 0.6;
        // enemy shooting
        if (now - e.lastShot > e.shootCooldown) {
          e.lastShot = now;
          enemyShoot(e);
        }

        // collision with player
        if (player.invulnerableUntil < now && checkCollision({ x: e.x, y: e.y, width: e.width, height: e.height }, player)) {
          // enemy destroyed on collision
          createParticles(e.x + e.width / 2, e.y + e.height / 2, "#ff88cc", 20, 4);
          game.score += Math.floor(e.width * 1.5);
          setScore(game.score);
          player.health -= 1;
          setLives(player.health);
          if (player.health <= 0) {
            // game over
            setRunning(false);
            setPaused(false);
          }
          return false;
        }

        return e.y < H + e.height;
      });

      // bullets hitting enemies
      game.bullets = game.bullets.filter((b) => {
        for (let i = 0; i < game.enemies.length; i++) {
          const e = game.enemies[i];
          if (checkCollision({ x: b.x, y: b.y, width: b.width, height: b.height }, e)) {
            e.health -= 1;
            createParticles(b.x, b.y, "#a6ffff", 6, 3);
            if (e.health <= 0) {
              createParticles(e.x + e.width / 2, e.y + e.height / 2, "#ff66cc", 22, 4.6);
              game.score += Math.floor(e.width);
              setScore(game.score);
              game.enemies.splice(i, 1);
            }
            return false;
          }
        }
        return true;
      });

      // enemy bullets hitting player
      game.enemyBullets = game.enemyBullets.filter((b) => {
        if (player.invulnerableUntil < now && checkCollision({ x: b.x, y: b.y, width: b.width, height: b.height }, player)) {
          createParticles(player.x + player.width / 2, player.y + player.height / 2, "#fff08a", 12, 3.8);
          player.health -= 1;
          setLives(player.health);
          if (player.health <= 0) {
            setRunning(false);
            setPaused(false);
          }
          return false;
        }
        return true;
      });

      // particles update
      game.particles = game.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        p.size *= 0.97;
        return p.life > 0;
      });

      // sync local score to state occasionally (already updated when enemies die)
    };

    // draw
    const draw = () => {
      // background (deep space)
      ctx.fillStyle = "#070816";
      ctx.fillRect(0, 0, W, H);

      // starfield - simple layered dots
      for (let i = 0; i < 80; i++) {
        const x = (i * 53 + (Date.now() / 12)) % W;
        const y = (i * 97 + (Date.now() / 25)) % H;
        ctx.fillStyle = "rgba(200,220,255,0.02)";
        ctx.fillRect(x, y, (i % 7) / 3 + 1, (i % 5) / 3 + 1);
      }

      // trails effect by drawing a translucent rect (creates nice neon trails)
      ctx.fillStyle = "rgba(10, 8, 20, 0.18)";
      ctx.fillRect(0, 0, W, H);

      // draw bullets (player)
      game.bullets.forEach((b) => {
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = b.color || "#a6ffff";
        ctx.fillStyle = b.color || "#fffa9e";
        ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.restore();
      });

      // draw enemy bullets
      game.enemyBullets.forEach((b) => {
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = b.color || "#ff66cc";
        ctx.fillStyle = b.color || "#ff66cc";
        ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.restore();
      });

      // draw enemies
      game.enemies.forEach((e) => {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#ff66cc";
        ctx.fillStyle = e.type === "tank" ? "#ff66cc" : e.type === "scout" ? "#ffaaee" : "#ff99c9";
        // ship-like polygon
        ctx.beginPath();
        ctx.moveTo(e.x + e.width / 2, e.y);
        ctx.lineTo(e.x + e.width, e.y + e.height / 3);
        ctx.lineTo(e.x + e.width / 2, e.y + e.height);
        ctx.lineTo(e.x, e.y + e.height / 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // draw player with neon glow
      ctx.save();
      ctx.shadowBlur = 36;
      ctx.shadowColor = "#00ffff";
      ctx.fillStyle = "#00f0ff";
      // simple triangular ship
      const px = player.x;
      const py = player.y;
      ctx.beginPath();
      ctx.moveTo(px + player.width / 2, py);
      ctx.lineTo(px + player.width, py + player.height);
      ctx.lineTo(px + player.width / 2, py + player.height - 10);
      ctx.lineTo(px, py + player.height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // muzzle glow when recently shot
      if (Date.now() - player.lastShot < 140) {
        const mx = player.x + player.width / 2;
        const my = player.y;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 28;
        ctx.shadowColor = "#ffff90";
        ctx.fillStyle = "#ffffb0";
        ctx.fillRect(mx - 6, my - 18, 12, 18);
        ctx.restore();
      }

      // draw particles
      game.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.restore();
      });

      // HUD
      // Score card
      ctx.save();
      ctx.fillStyle = "rgba(8,8,16,0.6)";
      ctx.fillRect(18, 18, 220, 68);
      ctx.restore();

      // Score text
      ctx.save();
      ctx.fillStyle = "#a6ffff";
      ctx.font = "700 20px 'Space Mono', monospace";
      ctx.fillText("SCORE", 28, 40);
      ctx.fillStyle = "#fff";
      ctx.font = "700 26px 'Space Mono', monospace";
      ctx.fillText(String(game.score).padStart(1, "0"), 28, 68);
      ctx.restore();

      // lives / shields
      ctx.save();
      ctx.fillStyle = "rgba(8,8,16,0.6)";
      ctx.fillRect(W - 170, 18, 150, 68);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "#ff99c9";
      ctx.font = "700 18px 'Space Mono', monospace";
      ctx.fillText("SHIELDS", W - 160, 40);
      for (let i = 0; i < 3; i++) {
        const x = W - 140 + i * 40;
        const y = 48;
        ctx.fillStyle = i < player.health ? "#ff66cc" : "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.arc(x, y + 8, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // weapon label
      ctx.save();
      ctx.fillStyle = "rgba(8,8,16,0.45)";
      ctx.fillRect(W / 2 - 80, 18, 160, 40);
      ctx.fillStyle = "#ffd17a";
      ctx.font = "700 16px 'Space Mono', monospace";
      ctx.fillText("WEAPON: " + player.weapon.toUpperCase(), W / 2 - 70, 44);
      ctx.restore();

      // paused overlay
      if (paused || !running) {
        ctx.save();
        ctx.fillStyle = "rgba(2,2,6,0.6)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.font = "800 48px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        if (!running) ctx.fillText("PAUSE / GAME OVER", W / 2, H / 2 - 40);
        else ctx.fillText("PAUSED", W / 2, H / 2 - 40);

        ctx.font = "600 20px 'Space Mono', monospace";
        ctx.fillText("Press R to restart, P to resume, Q to change weapon", W / 2, H / 2 + 6);
        ctx.restore();
      }
    };

    // loop
    const loop = () => {
      if (running && !paused) {
        update();
        draw();
      } else {
        // render even if paused so overlay is visible and canvas isn't blank
        draw();
      }
      loopRef.current = requestAnimationFrame(loop);
    };

    // start the animation loop
    resetGame();
    loop();

    // expose data for debug (optional)
    dataRef.current = game;

    // cleanup on unmount
    return () => {
      cancelAnimationFrame(loopRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused]); // re-run if pause state changes to re-render overlay immediately

  // simple top controls (React overlay)
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#070816" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {/* Top-left quick controls */}
      <div style={{ position: "absolute", left: 18, top: 18, zIndex: 20, color: "#a6ffff", fontFamily: "'Space Mono', monospace" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>NEON FURY</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          <button
            onClick={() => {
              setRunning(true);
              setPaused(false);
            }}
            style={{
              marginRight: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: "rgba(0,255,255,0.08)",
              border: "1px solid rgba(0,255,255,0.12)",
              color: "#a6ffff",
            }}
          >
            START
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              background: "rgba(255,210,120,0.04)",
              border: "1px solid rgba(255,210,120,0.08)",
              color: "#ffd17a",
            }}
          >
            {paused ? "RESUME" : "PAUSE"}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#fff" }}>
          Score: <strong>{String(score)}</strong> &nbsp; • &nbsp; Shields: <strong>{String(lives)}</strong> &nbsp; • &nbsp; Weapon: <strong>{weaponLabel}</strong>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          Controls: WASD/arrows move • Shift dash • Space / click shoot • Q switch weapon • P pause • R restart
        </div>
      </div>
    </div>
  );
}
