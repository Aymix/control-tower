import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, toSideBySide } from "@/lib/diff/parse";

const sample = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 export { a, b };
diff --git a/README.md b/README.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/README.md
@@ -0,0 +1,2 @@
+# Hello
+world
`;

describe("parseUnifiedDiff", () => {
  it("extracts files, statuses and line numbers", () => {
    const files = parseUnifiedDiff(sample);
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ["src/a.ts", "modified"],
      ["README.md", "added"],
    ]);
    const lines = files[0].hunks[0].lines;
    expect(lines[0]).toMatchObject({ type: "normal", oldLine: 1, newLine: 1, content: "const a = 1;" });
    expect(lines[1]).toMatchObject({ type: "del", oldLine: 2, newLine: null });
    expect(lines[2]).toMatchObject({ type: "add", oldLine: null, newLine: 2 });
    expect(files[1].additions).toBe(2);
  });
});

describe("toSideBySide", () => {
  it("pairs deletions with following additions", () => {
    const [file] = parseUnifiedDiff(sample);
    const rows = toSideBySide(file.hunks[0].lines);
    expect(rows).toHaveLength(4);
    expect(rows[1].left?.content).toBe("const b = 2;");
    expect(rows[1].right?.content).toBe("const b = 3;");
    expect(rows[2].left).toBeNull();
    expect(rows[2].right?.content).toBe("const c = 4;");
    expect(rows[3].left).toBe(rows[3].right);
  });
});
