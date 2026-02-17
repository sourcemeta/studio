import { useState } from "react";
import type { MetaschemaError,Position } from "../../../protocol/types";
import { goToPosition } from "../message";

interface Props {
  errors: MetaschemaError[];
}

function ErrorBox({
  error,
  size,
  indent
}: {
  error: MetaschemaError;
  size?: 'primary' | 'stack';
  indent: number;
}) {
  const clickable = Boolean(error.instancePosition);

  return (
    <div
      className={`
        bg-(--vscode-selection)
        border-l-[3px]
        rounded
        p-3
        transition-colors
        w-full
        max-w-full
        ${clickable ? "cursor-pointer hover:bg-(--vscode-hover)" : ""}
      `}
      style={{
        marginLeft: indent,
        borderLeftColor: "var(--error)"
      }}
      onClick={() =>
        clickable && goToPosition(error.instancePosition as Position)
      }
    >
      <div className="flex items-start gap-2">
        {size === 'stack' && (
          <span className="text-(--vscode-muted) font-mono select-none">↳</span>
        )}
        <div className="flex-1">
          <div className={`text-(--vscode-fg) ${size === 'primary' ? 'text-[14px] font-semibold' : 'text-[12px]'}`}>
            {error.error}
          </div>
          {error.instanceLocation && (
            <div className="mt-1 text-[11px] text-(--vscode-muted) break-all">
              {error.instanceLocation || "(root)"}
            </div>
        )}
        </div>
      </div>
    </div>
  );
}


export function MetaschemaStackTrace({errors}:Props){
  const [expanded,setExpanded]= useState(false);

  if(errors.length===0) return null;

  const [primary, ...stack] = errors;

  if (!primary) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Top level error */}
      <ErrorBox
        error={primary}
        size="primary"
        indent={0}
      />

      {stack.length > 0 && (
        <button
          className="flex items-center gap-1.5 cursor-pointer py-2 select-none hover:opacity-80"
          onClick={() => setExpanded(!expanded)}
        >
          <span
            className="text-(--vscode-muted) text-[10px] transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▶
          </span>
          {expanded ? 'Hide stack trace' : 'Show stack trace'}
        </button>
      )}

      {/* Stack trace */}
      <div className="w-full">
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="flex flex-col gap-2 mt-2">
            {
              stack.map((err,ind)=>{
                const STACK_INDENT = 16;
                return (
                  <div
                    key={ind}
                    className="flex items-start gap-2"
                    style={{ paddingLeft: STACK_INDENT }}
                  >
                    <span className="text-(--vscode-muted) font-mono select-none mt-1">↳</span>
                    <ErrorBox
                      error={err}
                      indent={0}
                    />
                  </div>
                )
              })
            }
          </div>
        </div>
      </div>
    </div>
  )
}


