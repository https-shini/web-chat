#!/usr/bin/env node
// Sobe backend e frontend juntos, sem dependência de runner externo.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

const run = (label, command, args) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("exit", (code) => {
        console.log(`\n[${label}] encerrou com código ${code}`);
        stop(code ?? 0);
    });
    children.push(child);
    return child;
};

let stopping = false;
const stop = (code) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
    process.exit(code);
};

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

run("backend", npm, ["--prefix", "backend", "run", "dev"]);
run("frontend", npm, ["run", "dev:front"]);
