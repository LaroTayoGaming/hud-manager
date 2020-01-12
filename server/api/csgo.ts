import fs from 'fs';
import path from 'path';
import * as VDF from '@node-steam/vdf';
import { getGamePath } from 'steam-game-path';
import express from 'express';
import { loadConfig } from './config';
import { GSI } from './../sockets';
import { spawn } from 'child_process';

interface CFG {
    cfg: string,
    file: string
}

function createCFG(customRadar: boolean, customKillfeed: boolean): CFG {
    let cfg = `cl_draw_only_deathnotices 1`;
    let file = 'hud';

    if (!customRadar) {
        cfg += `\ncl_drawhud_force_radar 1`;
    } else {
        file += '_radar';
    }
    if (customKillfeed) {
        file += '_killfeed';
        cfg += `\ncl_drawhud_force_deathnotices -1`;
        cfg += `\nmirv_pgl url "ws://localhost:31337/mirv"`;
        cfg += `\nmirv_pgl start`;
    }
    file += '.cfg';
    return { cfg, file };
}

function exists(file: string) {
    const CSGOPath = getGamePath(730);
    if (!CSGOPath || !CSGOPath.game || !CSGOPath.game.path) {
        return false;
    }
    const cfgDir = path.join(CSGOPath.game.path, 'csgo', 'cfg');

    return fs.existsSync(path.join(cfgDir, file));
}

function isCorrect(cfg: CFG) {
    const CSGOPath = getGamePath(730);
    if (!CSGOPath || !CSGOPath.game || !CSGOPath.game.path) {
        return false;
    }
    const file = cfg.file;
    const cfgDir = path.join(CSGOPath.game.path, 'csgo', 'cfg');
    return fs.readFileSync(path.join(cfgDir, file), 'UTF-8') === cfg.cfg;
}

export const checkCFGs: express.RequestHandler = async (req, res) => {
    const config = await loadConfig();
    const CSGOPath = getGamePath(730);
    if (!config || !CSGOPath || !CSGOPath.game || !CSGOPath.game.path) {
        return res.json({});
    }

    const switcher = [true, false];
    const cfgs: CFG[] = [];
    switcher.forEach(radar => {
        switcher.forEach(killfeed => {
            cfgs.push(createCFG(radar, killfeed));
        });
    });
    const files = cfgs.map(cfg => cfg.file);

    if (!files.every(exists)) {
        return res.json({ success: false, message: 'Files are missing' });
    }
    if (!cfgs.every(isCorrect)) {
        return res.json({ success: false, message: 'CFGs is incorrect' })
    }
    return res.json({ success: true });
}

export const createCFGs: express.RequestHandler = async (_req, res) => {
    const CSGOPath = getGamePath(730);
    if (!CSGOPath || !CSGOPath.game || !CSGOPath.game.path) {
        return res.json({});
    }
    const cfgDir = path.join(CSGOPath.game.path, 'csgo', 'cfg');

    try {
        const switcher = [true, false];

        switcher.forEach(radar => {
            switcher.forEach(killfeed => {
                const cfg = createCFG(radar, killfeed);
                const cfgPath = path.join(cfgDir, cfg.file);
                if (fs.existsSync(cfgPath)) {
                    fs.unlinkSync(cfgPath);
                }
                fs.writeFileSync(cfgPath, cfg.cfg, 'UTF-8');
            });
        });
        return res.json({ success: true, message: 'Configs were successfully saved' })
    } catch {
        return res.json({ success: false, message: 'Unexpected error occured' })
    }
}

export const getLatestData: express.RequestHandler = async (_req, res) => {
    return res.json(GSI.last || {});
}

export const getSteamPath: express.RequestHandler = async (_req, res) => {
    const CSGOPath = getGamePath(730);
    if(!CSGOPath || !CSGOPath.steam || !CSGOPath.steam.path){
        return res.status(404).json({success: false});
    }
    return res.json({success:true, steamPath: path.join(CSGOPath.steam.path, 'Steam.exe')});
}

export const run: express.RequestHandler = async (req, res) => {
    const config = await loadConfig();
    if(!config ||!req.query.config || typeof req.query.config !== "string"){
        return res.sendStatus(422);
    }
    const CSGOData = getGamePath(730);
    if(!CSGOData || !CSGOData.steam || !CSGOData.steam.path || !CSGOData.game || !CSGOData.game.path){
        return res.sendStatus(404);
    }

    const HLAEPath = config.hlaePath;
    const CSGOPath = path.join(CSGOData.game.path, 'csgo.exe');

    const isHLAE = req.query.config.includes("killfeed");
    const exePath = isHLAE ? HLAEPath : path.join(CSGOData.steam.path, "Steam.exe");

    const args = [];

    if(!isHLAE){
        args.push('-applaunch 730', `+exec ${req.query.config}`);
    } else {
        args.push('-csgoLauncher','-noGui', '-autoStart', `-csgoExe "${CSGOPath}"`, `-customLaunchOptions "+exec ${req.query.config}"`);
    }

    try {
        const steam = spawn(`"${exePath}"`, args, { detached: true, shell: true, stdio: 'ignore' });
        steam.unref();
    } catch(e) {
        return res.sendStatus(500);
    }
    return res.sendStatus(200);
}