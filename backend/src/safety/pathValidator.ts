import path from "node:path";
import fs from "node:fs/promises";
import { safetyManager, type SafetyContext } from "./safetyContext.js";

export interface ValidationResult {
  safe: boolean;
  reason?: string;
}

/**
 * Helper to check if a specific path matches any blocked pattern.
 * Exposed so tools like searchFiles can use it to skip directories.
 */
export function isPathBlocked(targetPath: string, context: SafetyContext): boolean {
  return context.blockedPatterns.some((patternString) => {
    const regex = new RegExp(patternString);
    return regex.test(targetPath);
  });
}

/**
 * Checks if a requested path is allowed based on the security context.
 * Prevents Directory Traversal (e.g., ../../etc/passwd)
 */
export function isPathAllowed(filePath: string, context: SafetyContext = safetyManager.getContext()): ValidationResult {
  const resolvedPath = path.resolve(context.projectRoot, filePath);

  // 1. Verify path is strictly inside the project root (prevents directory traversal)
  const relativeToRoot = path.relative(context.projectRoot, resolvedPath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return { safe: false, reason: "Path traversal detected: File is outside project root." };
  }

  // 2. Verify path is inside at least one of the allowed relative paths
  const isInsideAllowedPath = context.allowedPaths.some((allowedDir) => {
    const resolvedAllowedDir = path.resolve(context.projectRoot, allowedDir);
    const relativeToAllowed = path.relative(resolvedAllowedDir, resolvedPath);
    return !relativeToAllowed.startsWith("..") && !path.isAbsolute(relativeToAllowed);
  });

  if (!isInsideAllowedPath) {
    return { safe: false, reason: `Path is not within allowed directories: ${context.allowedPaths.join(", ")}` };
  }

  // 3. Check dynamically blocked regex patterns (e.g., node_modules)
  if (isPathBlocked(resolvedPath, context)) {
    return { safe: false, reason: "Path matches a blocked pattern configured in safety settings." };
  }

  // 4. Check not allowed file extensions
  const ext = path.extname(resolvedPath).toLowerCase();
  if (context.notAllowedExtensions.includes(ext)) {
    return { safe: false, reason: `File extension '${ext}' is strictly prohibited.` };
  }

  return { safe: true };
}

/**
 * Validates whether an operation is permitted on a specific file path.
 */
export async function validateFileOperation(
  operation: "read" | "write" | "delete" | "execute",
  filePath: string,
  context: SafetyContext = safetyManager.getContext()
): Promise<ValidationResult> {
  const resolvedPath = path.resolve(context.projectRoot, filePath);

  // 1. Check basic path security
  const pathCheck = isPathAllowed(resolvedPath, context);
  if (!pathCheck.safe) return pathCheck;

  // 2. Validate Read-Only files against write/delete operations
  if (operation === "write" || operation === "delete") {
    const fileName = path.basename(resolvedPath);
    if (context.readOnlyFiles.includes(fileName)) {
      return { safe: false, reason: `File '${fileName}' is marked as read-only.` };
    }
  }

  // 3. Validate existence for specific operations
  if (operation === "read" || operation === "delete") {
    try {
      await fs.access(resolvedPath);
    } catch {
      return { safe: false, reason: `Cannot ${operation}: File does not exist at path.` };
    }
  }

  // 4. Prevent execute operations entirely unless explicitly handled
  if (operation === "execute") {
    return { safe: false, reason: "Direct execution of files is disabled for safety." };
  }

  return { safe: true };
}