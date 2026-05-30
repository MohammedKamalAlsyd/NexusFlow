import path from "node:path";
import fs from "node:fs/promises";
import { configManager } from "../config/index.js";

export interface ValidationResult {
  safe: boolean;
  reason?: string;
}

/**
 * Checks if a path matches any blocked patterns configured in safety settings.
 * Used to skip directories and prevent access to restricted areas.
 */
export function isPathBlocked(targetPath: string): boolean {
  return configManager.config.safety.blockedPatterns.some((patternString) => {
    return new RegExp(patternString).test(targetPath);
  });
}

/**
 * Validates if a path is allowed based on security configuration.
 * Prevents directory traversal, restricts to allowed directories, blocks extensions,
 * and checks against blocked patterns.
 */
export function isPathAllowed(filePath: string): ValidationResult {
  const safety = configManager.config.safety;
  const resolvedPath = path.resolve(safety.projectRoot, filePath);

  // 1. Verify path is strictly inside the project root (prevents directory traversal)
  const relativeToRoot = path.relative(safety.projectRoot, resolvedPath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return { safe: false, reason: "Path traversal detected." };
  }

  // 2. Verify path is inside at least one of the allowed directories
  const isInsideAllowedPath = safety.allowedPaths.some((allowedDir) => {
    const resolvedAllowedDir = path.resolve(safety.projectRoot, allowedDir);
    const relativeToAllowed = path.relative(resolvedAllowedDir, resolvedPath);
    return !relativeToAllowed.startsWith("..") && !path.isAbsolute(relativeToAllowed);
  });

  if (!isInsideAllowedPath) {
    return { safe: false, reason: `Path is not within allowed directories.` };
  }

  // 3. Check dynamically blocked regex patterns (e.g., node_modules)
  if (isPathBlocked(resolvedPath)) {
    return { safe: false, reason: "Path matches a blocked pattern." };
  }

  // 4. Check file extension restrictions
  const ext = path.extname(resolvedPath).toLowerCase();
  if (safety.notAllowedExtensions.includes(ext)) {
    return { safe: false, reason: `File extension '${ext}' is strictly prohibited.` };
  }

  return { safe: true };
}

/**
 * Validates whether a specific operation is permitted on a file path.
 * Checks path security, file access constraints, and operation-specific rules.
 */
export async function validateFileOperation(
  operation: "read" | "write" | "delete" | "execute",
  filePath: string
): Promise<ValidationResult> {
  const safety = configManager.config.safety;
  const resolvedPath = path.resolve(safety.projectRoot, filePath);

  // 1. Check basic path security
  const pathCheck = isPathAllowed(resolvedPath);
  if (!pathCheck.safe) return pathCheck;

  // 2. Validate read-only files against write/delete operations
  if (operation === "write" || operation === "delete") {
    const fileName = path.basename(resolvedPath);
    if (safety.readOnlyFiles.includes(fileName)) {
      return { safe: false, reason: `File '${fileName}' is read-only.` };
    }
  }

  // 3. Validate file existence for read/delete operations
  if (operation === "read" || operation === "delete") {
    try {
      await fs.access(resolvedPath);
    } catch {
      return { safe: false, reason: `File does not exist.` };
    }
  }

  // 4. Prevent direct file execution
  if (operation === "execute") return { safe: false, reason: "Direct execution disabled." };

  return { safe: true };
}