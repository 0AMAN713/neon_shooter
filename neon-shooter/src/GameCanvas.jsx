import React, { useEffect, useRef, useState } from "react";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => Math.random() * (max - min) + min;

export default function GameCanvas() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const gameRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const laneCount = 3;
    const roadWidth = Math.min(520, width * 0.75);
    const laneWidth = roadWidth / laneCount;
    const roadX = (width - roadWidth) / 2;

    const game = {
      keys: {},
      laneCount,
      laneWidth,
      roadWidth,
      roadX,
      trackOffset: 0,
      score: 0,
      best: 0,
      speed: 7,
      maxSpeed: 18,
      acceleration: 0.007,
      spawnTimer: 0,
      spawnInterval: 1200,
      lastTime: performance.now(),
      obstacles: [],
      running: true,
      player: {
        lane: 1,
        x: roadX + laneWidth * 1 + laneWidth * 0.15,
        y: height - 170,
        width: laneWidth * 0.7,
        height: 130,
      },
    };

    gameRef.current = game;

    const resetGame = () => {
      game.trackOffset = 0;
      game.score = 0;
      game.speed = 7;
      game.spawnTimer = 0;
      game.spawnInterval = 1200;
      game.obstacles = [];
      game.running = true;
      game.player.lane = 1;
      game.player.y = height - 170;
      setScore(0);
      setSpeed(7);
      setGameOver(false);
      setRunning(true);
    };

    const laneCenterX = (lane) => roadX + lane * laneWidth + laneWidth * 0.5;

    const spawnObstacle = () => {
      const lane = Math.floor(Math.random() * laneCount);
      const obstacleWidth = laneWidth * rand(0.52, 0.75);
      const obstacleHeight = rand(90, 130);
      game.obstacles.push({
        lane,
        x: laneCenterX(lane) - obstacleWidth / 2,
        y: -obstacleHeight - 30,
        width: obstacleWidth,
        height: obstacleHeight,
        color: `hsl(${rand(0, 360)} 90% 58%)`,
      });
    };

    const checkCollision = (a, b) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;

    const drawBackground = () => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#0a1020");
      gradient.addColorStop(0.5, "#0f1f35");
      gradient.addColorStop(1, "#090914");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#0a5f2f";
      ctx.fillRect(0, 0, roadX, height);
      ctx.fillRect(roadX + roadWidth, 0, width - (roadX + roadWidth), height);

      ctx.fillStyle = "#2f2f38";
      ctx.fillRect(roadX, 0, roadWidth, height);

      ctx.strokeStyle = "#f8f8f8";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(roadX + 3, 0);
      ctx.lineTo(roadX + 3, height);
      ctx.moveTo(roadX + roadWidth - 3, 0);
      ctx.lineTo(roadX + roadWidth - 3, height);
      ctx.stroke();

      ctx.setLineDash([40, 34]);
      ctx.strokeStyle = "#ffef9d";
      ctx.lineWidth = 5;
      for (let lane = 1; lane < laneCount; lane += 1) {
        const laneDividerX = roadX + lane * laneWidth;
        ctx.beginPath();
        ctx.moveTo(laneDividerX, -height + game.trackOffset % height);
        ctx.lineTo(laneDividerX, height * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };

    const drawCar = (x, y, carWidth, carHeight, color, glow) => {
      const wheelWidth = carWidth * 0.18;
      const wheelHeight = carHeight * 0.2;

      ctx.fillStyle = "#05070c";
      ctx.fillRect(x - wheelWidth * 0.7, y + 15, wheelWidth, wheelHeight);
      ctx.fillRect(x + carWidth - wheelWidth * 0.3, y + 15, wheelWidth, wheelHeight);
      ctx.fillRect(x - wheelWidth * 0.7, y + carHeight - wheelHeight - 15, wheelWidth, wheelHeight);
      ctx.fillRect(
        x + carWidth - wheelWidth * 0.3,
        y + carHeight - wheelHeight - 15,
        wheelWidth,
        wheelHeight
      );

      ctx.shadowColor = glow;
      ctx.shadowBlur = 18;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, carWidth, carHeight);
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(x + carWidth * 0.14, y + 12, carWidth * 0.72, 24);
      ctx.fillRect(x + carWidth * 0.3, y + carHeight * 0.35, carWidth * 0.4, 32);

      ctx.fillStyle = "#fefefe";
      ctx.fillRect(x + 4, y + 6, 14, 8);
      ctx.fillRect(x + carWidth - 18, y + 6, 14, 8);
      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect(x + 4, y + carHeight - 14, 14, 8);
      ctx.fillRect(x + carWidth - 18, y + carHeight - 14, 14, 8);
    };

    const update = (deltaMs) => {
      if (!game.running) return;

      if (game.keys.arrowleft || game.keys.a) game.player.lane -= 1;
      if (game.keys.arrowright || game.keys.d) game.player.lane += 1;
      game.player.lane = clamp(game.player.lane, 0, laneCount - 1);
      game.player.x = roadX + game.player.lane * laneWidth + laneWidth * 0.15;

      game.speed = clamp(game.speed + game.acceleration * deltaMs, 7, game.maxSpeed);
      game.trackOffset += game.speed;

      game.spawnTimer += deltaMs;
      if (game.spawnTimer > game.spawnInterval) {
        game.spawnTimer = 0;
        game.spawnInterval = clamp(game.spawnInterval - 18, 420, 1400);
        spawnObstacle();
      }

      const distance = (game.speed * deltaMs) / 100;
      game.score += distance;
      if (game.score > game.best) game.best = game.score;

      for (const obstacle of game.obstacles) {
        obstacle.y += game.speed * 1.2;
      }

      game.obstacles = game.obstacles.filter((o) => o.y < height + o.height + 40);

      for (const obstacle of game.obstacles) {
        if (checkCollision(game.player, obstacle)) {
          game.running = false;
          setRunning(false);
          setGameOver(true);
          break;
        }
      }

      setScore(Math.floor(game.score));
      setBestScore(Math.floor(game.best));
      setSpeed(Number(game.speed.toFixed(1)));
    };

    const render = () => {
      drawBackground();
      for (const obstacle of game.obstacles) {
        drawCar(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.color, obstacle.color);
      }
      drawCar(game.player.x, game.player.y, game.player.width, game.player.height, "#10e0ff", "#00f0ff");

      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(16, 16, 270, 122);
      ctx.fillStyle = "#f6f8ff";
      ctx.font = "700 24px system-ui";
      ctx.fillText(`Score: ${Math.floor(game.score)}`, 30, 52);
      ctx.font = "600 20px system-ui";
      ctx.fillText(`Best: ${Math.floor(game.best)}`, 30, 82);
      ctx.fillText(`Speed: ${game.speed.toFixed(1)}`, 30, 112);

      if (!game.running) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 64px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Crash!", width / 2, height / 2 - 30);
        ctx.font = "500 28px system-ui";
        ctx.fillText("Press Enter to race again", width / 2, height / 2 + 30);
        ctx.textAlign = "left";
      }
    };

    const loop = (now) => {
      const delta = now - game.lastTime;
      game.lastTime = now;

      update(delta);
      render();

      animationRef.current = requestAnimationFrame(loop);
    };

    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      game.keys[key] = true;

      if (event.key === "Enter" && !game.running) {
        resetGame();
      }
    };

    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      game.keys[key] = false;
    };

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      game.player.y = height - 170;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);

    setRunning(true);
    animationRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} />

      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          color: "white",
          textAlign: "left",
          fontFamily: "system-ui, sans-serif",
          background: "rgba(0,0,0,0.45)",
          padding: "14px 16px",
          borderRadius: 10,
          maxWidth: 340,
        }}
      >
        <h1 style={{ margin: "0 0 10px", fontSize: 22 }}>Neon Highway Racer</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>
          Controls: <b>Left/Right</b> or <b>A/D</b> to change lanes. Avoid traffic and survive as long as
          possible.
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 14 }}>
          Status: <b>{running ? "Racing" : gameOver ? "Crashed" : "Loading"}</b>
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 14 }}>
          Score: <b>{score}</b> • Best: <b>{bestScore}</b> • Speed: <b>{speed}</b>
        </p>
      </div>
    </div>
  );
}
