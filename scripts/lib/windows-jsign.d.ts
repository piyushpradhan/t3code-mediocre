import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/process";
declare const JsignFailedError_base: Schema.Class<
  JsignFailedError,
  Schema.TaggedStruct<
    "JsignFailedError",
    {
      readonly file: Schema.String;
      readonly exitCode: Schema.Number;
    }
  >,
  import("effect/Cause").YieldableError
>;
export declare class JsignFailedError extends JsignFailedError_base {
  get message(): string;
}
export declare const signWithJsign: (
  file: string,
) => Effect.Effect<
  undefined,
  Config.ConfigError | JsignFailedError | import("effect/PlatformError").PlatformError,
  ChildProcessSpawner.ChildProcessSpawner | import("effect/Scope").Scope
>;
export default function sign(configuration: { readonly path: string }): Promise<void>;
export {};
