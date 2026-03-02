#!/usr/bin/env node
'use strict';

/**
 * TARS Learning Podcast Feed Generator
 * 
 * Maintains an RSS podcast feed of curated episodes.
 * Each episode is sourced from an original podcast's RSS feed
 * with the topic prepended to the title.
 * 
 * Usage:
 *   node feed-generator.cjs add --topic "Biological Aging" --feed-url "https://feeds.example.com/podcast.xml" --episode "Episode Title" [--audio-url "direct-mp3-url"]
 *   node feed-generator.cjs add --topic "Taiwan Semiconductors" --audio-url "https://..." --title "Chris Miller on Chip Wars" --description "..." --duration "3600"
 *   node feed-generator.cjs remove --id <episode-id>
 *   node feed-generator.cjs list
 *   node feed-generator.cjs build
 */

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

const DATA_DIR = path.join(__dirname, 'data');
const EPISODES_FILE = path.join(DATA_DIR, 'episodes.json');
const FEED_FILE = path.join(__dirname, 'feed.xml');

const FEED_TITLE = 'Pulse';
const FEED_DESCRIPTION = 'Curated podcast episodes by Pulse — current awareness radar. Episodes are organized by tracked topic.';
const FEED_LINK = 'https://hvhoon.github.io/tars-podcast-feed/feed.xml';
const FEED_IMAGE = 'https://hvhoon.github.io/tars-podcast-feed/TARS.png'; // Cover image

// ── Data ──

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadEpisodes() {
  ensureDataDir();
  try { return JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8')); }
  catch { return []; }
}

function saveEpisodes(episodes) {
  ensureDataDir();
  fs.writeFileSync(EPISODES_FILE, JSON.stringify(episodes, null, 2));
}

// ── RSS Feed Builder ──

function escapeXml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRFC2822(date) {
  return new Date(date).toUTCString();
}

function buildFeed(episodes) {
  const now = formatRFC2822(new Date());
  
  const items = episodes.map(ep => {
    const title = `[${ep.topic}] — ${ep.title}`;
    const guid = ep.id || `pulse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    return `    <item>
      <title>${escapeXml(title)}</title>
      <description>${escapeXml(ep.description || '')}</description>
      <enclosure url="${escapeXml(ep.audioUrl)}" type="audio/mpeg" length="${ep.fileSize || 0}" />
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${formatRFC2822(ep.addedAt || new Date())}</pubDate>
      ${ep.duration ? `<itunes:duration>${ep.duration}</itunes:duration>` : ''}
      ${ep.imageUrl ? `<itunes:image href="${escapeXml(ep.imageUrl)}" />` : ''}
      ${ep.originalPodcast ? `<itunes:author>${escapeXml(ep.originalPodcast)}</itunes:author>` : '<itunes:author>TARS</itunes:author>'}
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <link>${escapeXml(FEED_LINK)}</link>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${escapeXml(FEED_LINK)}" rel="self" type="application/rss+xml" />
    <itunes:author>TARS</itunes:author>
    <itunes:summary>${escapeXml(FEED_DESCRIPTION)}</itunes:summary>
    <itunes:category text="News" />
    ${FEED_IMAGE ? `<itunes:image href="${escapeXml(FEED_IMAGE)}" />` : ''}
    <image>
      <url>${escapeXml(FEED_IMAGE)}</url>
      <title>${escapeXml(FEED_TITLE)}</title>
      <link>${escapeXml(FEED_LINK)}</link>
    </image>
${items}
  </channel>
</rss>`;
}

// ── Fetch Episode from Original Feed ──

async function fetchEpisodeFromFeed(feedUrl, episodeSearch) {
  const res = await fetch(feedUrl);
  if (!res.ok) throw new Error(`Failed to fetch feed: ${res.status}`);
  const xml = await res.text();
  
  // Simple XML parsing for podcast feeds
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const searchLower = episodeSearch.toLowerCase();
  
  for (const item of items) {
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    if (title.toLowerCase().includes(searchLower)) {
      const encMatch = item.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
      const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
      const durationMatch = item.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
      const lengthMatch = item.match(/<enclosure[^>]*length=["'](\d+)["'][^>]*>/i);
      const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      
      if (!encMatch) continue; // skip items without audio
      
      const imageMatch = item.match(/<itunes:image[^>]*href=["']([^"']+)["']/i);
      
      return {
        title: title,
        audioUrl: encMatch[1],
        description: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500) : '',
        duration: durationMatch ? durationMatch[1].trim() : null,
        fileSize: lengthMatch ? parseInt(lengthMatch[1]) : 0,
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : null,
        imageUrl: imageMatch ? imageMatch[1] : '',
      };
    }
  }
  
  throw new Error(`Episode matching "${episodeSearch}" not found in feed`);
}

// ── Commands ──

async function cmdAdd(args) {
  const episodes = loadEpisodes();
  
  const id = `tars-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let episode;
  
  if (args.feedUrl && args.episode) {
    // Fetch from original podcast feed
    console.log(`Fetching from feed: ${args.feedUrl}`);
    console.log(`Searching for: ${args.episode}`);
    const fetched = await fetchEpisodeFromFeed(args.feedUrl, args.episode);
    episode = {
      id,
      topic: args.topic,
      title: fetched.title,
      audioUrl: fetched.audioUrl,
      description: fetched.description,
      duration: fetched.duration,
      fileSize: fetched.fileSize,
      originalPodcast: args.podcast || null,
      originalFeedUrl: args.feedUrl,
      addedAt: new Date().toISOString(),
    };
  } else if (args.audioUrl && args.title) {
    // Direct add
    episode = {
      id,
      topic: args.topic,
      title: args.title,
      audioUrl: args.audioUrl,
      description: args.description || '',
      duration: args.duration || null,
      fileSize: parseInt(args.fileSize || '0'),
      originalPodcast: args.podcast || null,
      imageUrl: args.imageUrl || '',
      addedAt: new Date().toISOString(),
    };
  } else {
    console.error('Must provide either --feed-url + --episode, or --audio-url + --title');
    process.exit(1);
  }
  
  episodes.unshift(episode); // newest first
  saveEpisodes(episodes);
  
  // Rebuild feed
  const feedXml = buildFeed(episodes);
  fs.writeFileSync(FEED_FILE, feedXml);
  
  console.log(`✅ Added: [${episode.topic}] — ${episode.title}`);
  console.log(`   Audio: ${episode.audioUrl.slice(0, 80)}...`);
  console.log(`   Feed rebuilt: ${FEED_FILE}`);
  return episode;
}

function cmdRemove(args) {
  const episodes = loadEpisodes();
  const idx = episodes.findIndex(e => e.id === args.id);
  if (idx === -1) { console.error(`Episode not found: ${args.id}`); process.exit(1); }
  
  const removed = episodes.splice(idx, 1)[0];
  saveEpisodes(episodes);
  
  const feedXml = buildFeed(episodes);
  fs.writeFileSync(FEED_FILE, feedXml);
  
  console.log(`🗑️ Removed: [${removed.topic}] — ${removed.title}`);
}

function cmdList() {
  const episodes = loadEpisodes();
  if (episodes.length === 0) { console.log('No episodes in feed.'); return; }
  
  console.log(`${episodes.length} episode(s):\n`);
  for (const ep of episodes) {
    console.log(`  [${ep.topic}] — ${ep.title}`);
    console.log(`    ID: ${ep.id} | Added: ${ep.addedAt}`);
    console.log('');
  }
}

function cmdBuild() {
  const episodes = loadEpisodes();
  const feedXml = buildFeed(episodes);
  fs.writeFileSync(FEED_FILE, feedXml);
  console.log(`✅ Feed built: ${episodes.length} episodes → ${FEED_FILE}`);
}

// ── CLI ──

async function main() {
  const command = process.argv[2];
  
  // Parse remaining args
  const rawArgs = process.argv.slice(3);
  const args = {};
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i].startsWith('--')) {
      const key = rawArgs[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = rawArgs[i + 1] || true;
      i++;
    }
  }
  
  switch (command) {
    case 'add': await cmdAdd(args); break;
    case 'remove': cmdRemove(args); break;
    case 'list': cmdList(); break;
    case 'build': cmdBuild(); break;
    default:
      console.log(`Usage: node feed-generator.cjs <add|remove|list|build> [options]`);
      console.log(`\nExamples:`);
      console.log(`  node feed-generator.cjs add --topic "Biological Aging" --feed-url "https://feeds.megaphone.fm/driveshow" --episode "Eric Verdin" --podcast "Peter Attia"`);
      console.log(`  node feed-generator.cjs add --topic "AI" --audio-url "https://..." --title "Episode Title" --podcast "Lex Fridman"`);
      console.log(`  node feed-generator.cjs list`);
      console.log(`  node feed-generator.cjs build`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
