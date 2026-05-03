import axios from "axios";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:4000";

const api = axios.create({
  baseURL: BASE,
  timeout: 90000,
});

export async function getFlow(repoUrl) {
  const { data } = await api.post("/api/flow", { repo_url: repoUrl });
  return data;
}

export async function getImpact(repoUrl, functionName, filePath) {
  const { data } = await api.post("/api/impact", {
    repo_url: repoUrl,
    function_name: functionName,
    file_path: filePath,
  });
  return data;
}

export async function getFunctions(repoUrl, filePath) {
  const { data } = await api.post("/api/functions", {
    repo_url: repoUrl,
    file_path: filePath,
  });
  return data; // { functions: ["fn1", "fn2", ...], file_path }
}

export async function generateContent(repoUrl, filePath, mode = "both", functionName = null) {
  const { data } = await api.post("/api/generate", {
    repo_url: repoUrl,
    file_path: filePath,
    mode,
    // Pass specific function name if selected
    ...(functionName ? { function_name: functionName } : {}),
  });

  // if (data.mode === "tests") {
  //   return { tests: data.code, docs: null, framework: data.framework };
  // } else if (data.mode === "docs") {
  //   return { tests: null, docs: data.code, framework: data.framework };
  // } else {
  //   const parts = data.code.split("2. DOCS");
  //   if (parts.length === 2) {
  //     return {
  //       tests: parts[0].replace("1. TESTS", "").trim(),
  //       docs:  parts[1].trim(),
  //       framework: data.framework,
  //     };
  //   }
  //   return { tests: data.code, docs: data.code, framework: data.framework };
  // }
  return {
    tests: data.tests || null,
    docs: data.docs || null,
    framework: data.framework,
  };
}