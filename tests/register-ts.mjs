import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./register-ts-hooks.mjs", import.meta.url).href, pathToFileURL("./"));
