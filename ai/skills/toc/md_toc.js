#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

/**
 * Generate and update table of contents for markdown files
 * Identifies all headings (h1-h6) and their content boundaries
 */

function generateAnchor(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseMarkdown(content) {
  const lines = content.split("\n");
  const headings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);

    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const anchor = generateAnchor(text);

      headings.push({
        level,
        text,
        startLine: i + 1, // 1-indexed
        endLine: i + 1, // Will be updated
        anchor,
      });
    }
  }

  // Calculate end lines for each heading
  for (let i = 0; i < headings.length; i++) {
    if (i < headings.length - 1) {
      // End line is one before the next heading
      headings[i].endLine = headings[i + 1].startLine - 1;
    } else {
      // Last heading extends to end of file
      headings[i].endLine = lines.length;
    }
  }

  return headings;
}

function generateTOC(headings) {
  // Skip the first h1 (main title) and the TOC heading itself for TOC
  const contentHeadings = headings.slice(1).filter(h => h.text !== "Table of Contents");

  if (contentHeadings.length === 0) {
    return "";
  }

  let toc = "## Table of Contents\n\n";
  toc += "| Section | Lines |\n";
  toc += "|---------|-------|\n";

  // Track numbering at each level (indices 0-4 for h2-h6)
  const counters = [0, 0, 0, 0, 0];
  let prevLevel = 1;

  for (const heading of contentHeadings) {
    const level = heading.level - 2; // h2=0, h3=1, h4=2, etc.

    // Reset counters for deeper levels when we go back up
    if (level < prevLevel) {
      for (let i = level + 1; i < counters.length; i++) {
        counters[i] = 0;
      }
    }

    // Increment counter at current level
    counters[level]++;

    // Build the number string (e.g., "1.2.3")
    const numberParts = [];
    for (let i = 0; i <= level; i++) {
      numberParts.push(counters[i]);
    }
    const numberPrefix = numberParts.join(".");

    const link = `[${heading.text}](#${heading.anchor})`;
    const lineRange = `${heading.startLine}-${heading.endLine}`;

    toc += `| ${numberPrefix}. ${link} | ${lineRange} |\n`;

    prevLevel = level;
  }

  return toc;
}

function updateMarkdownFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const headings = parseMarkdown(content);

  if (headings.length === 0) {
    console.log("No headings found in file");
    return;
  }

  // Find if TOC already exists
  let tocStartLine = -1;
  let tocEndLine = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].includes("## Table of Contents")) {
      tocStartLine = i;
      // Find end of TOC (next non-empty line that's not part of table)
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "" && lines[j + 1]?.match(/^#+\s/)) {
          tocEndLine = j;
          break;
        }
        if (lines[j].match(/^#+\s/)) {
          tocEndLine = j;
          break;
        }
      }
      break;
    }
  }

  // Generate TOC first pass to determine its length
  const tocContent = generateTOC(headings, 0);
  const tocLineCount = tocContent.split("\n").length;

  // Calculate line offset for headings after TOC insertion
  // TOC will be inserted after the first h1 heading (which starts at headings[0].startLine)
  // All headings after the first h1 will be shifted by the TOC line count
  const insertAfter = headings[0].startLine;

  // Apply offset only to headings that come after the first h1
  const adjustedHeadings = headings.map((h, idx) => {
    if (tocStartLine === -1 && idx > 0) {
      // No existing TOC, so shift all headings after the first h1
      return {
        ...h,
        startLine: h.startLine + tocLineCount,
        endLine: h.endLine + tocLineCount,
      };
    }
    return h;
  });

  // Generate final TOC with the adjusted headings (no additional offset needed)
  const finalToc = generateTOC(adjustedHeadings, 0);

  let newContent;

  if (tocStartLine !== -1) {
    // Replace existing TOC
    const beforeTOC = lines.slice(0, tocStartLine).join("\n");
    const afterTOC = lines.slice(tocEndLine).join("\n");
    newContent = beforeTOC + "\n" + finalToc + afterTOC;
  } else {
    // Insert TOC after first heading
    const beforeTOC = lines.slice(0, insertAfter).join("\n");
    const afterTOC = lines.slice(insertAfter).join("\n");
    newContent = beforeTOC + "\n\n" + finalToc + afterTOC;
  }

  writeFileSync(filePath, newContent);
  console.log(`✓ Updated TOC in ${filePath}`);

  // Print summary
  console.log(`\nHeadings found: ${adjustedHeadings.length}`);
  adjustedHeadings.forEach((h, i) => {
    console.log(
      `  ${i + 1}. ${"#".repeat(h.level)} ${h.text} (lines ${h.startLine}-${h.endLine})`
    );
  });
}

// Main execution
const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: bun md_toc.js <filepath>");
  process.exit(1);
}

const resolvedPath = resolve(filePath);
updateMarkdownFile(resolvedPath);
