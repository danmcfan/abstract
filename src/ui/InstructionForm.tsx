import { For, type JSX } from "solid-js";
import {
  BITBOX_INSTRUCTION_SET,
  INSTRUCTIONS,
  MAX_MNEMONIC,
  OPCODE_LIST,
  OPCODES,
  rowOf,
  type InstructionID,
  type InstructionSet,
  type InstructionSetCheck,
  type Problem,
  shownProblems,
} from "../sim/instruction";
import { speak } from "./speech";
import { editInstructions, session } from "./state";

const pad = (n: number): string => String(n).padStart(2, "0");
const binary = (n: number): string => n.toString(2).padStart(4, "0");

// Every change to the table goes through the session, which checks it and
// says whether Bitbox has anything to say about it.
function edit(rows: InstructionSet): void {
  speak(editInstructions(rows));
}

const pick = (id: InstructionID): InstructionSet => ({ [id]: rowOf(BITBOX_INSTRUCTION_SET, id) });

const underline = (problem: Problem | null): string => (problem === null ? "border-ink" : "border-fail");

const check = (): InstructionSetCheck => session().instructionCheck;
// The opcodes no row has yet: one, once the table is good.
const spare = (): string => (check().spare.length === OPCODES ? "all of them" : check().spare.join(", ") || "none");

// The typing pool: in place of the board, a typewritten form with one row
// per instruction. The player types a mnemonic and picks an opcode for each,
// and the check runs live, so there's no test run.
export function InstructionForm(): JSX.Element {
  return (
    <section
      id="instruction-set"
      class="flex h-full min-h-0 flex-col p-4 text-sm text-ink-deep sheet"
      aria-label="Instruction set"
    >
      <header class="flex shrink-0 items-center gap-4 border-b-2 border-ink pb-2">
        <Typewriters class="h-10 w-40 shrink-0 text-ink" />
        <div class="min-w-0 flex-1">
          <h2 class="font-bold text-ink">SH {pad(session().levelIndex + 1)} · INSTRUCTION SET</h2>
          <p class="text-note">{session().level.goal}</p>
        </div>
        <button
          id="use-all"
          class="btn btn-sm"
          onClick={() => {
            edit(BITBOX_INSTRUCTION_SET);
          }}
        >
          Use all of Bitbox's
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <table class="w-full border-collapse text-note">
          <thead>
            <tr class="text-left text-label tracking-label text-pencil uppercase">
              <th class="py-1 font-normal">What it does</th>
              <th class="py-1 font-normal">Mnemonic</th>
              <th class="py-1 font-normal">Opcode</th>
              <th class="py-1 font-normal">
                <span class="sr-only">Bitbox's pick</span>
              </th>
              <th class="py-1 font-normal">
                <span class="sr-only">Problem</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={INSTRUCTIONS}>
              {(instruction) => {
                const { id } = instruction;
                const row = (): ReturnType<typeof rowOf> => rowOf(session().instructionSet, id);
                const problems = (): ReturnType<typeof shownProblems> => shownProblems(check().rows[id]);
                const reason = (): string =>
                  [...new Set([problems().mnemonic, problems().opcode])].filter((p) => p !== null).join(", ");
                return (
                  <tr class="border-b-hair border-wash" data-instruction={id}>
                    <td class="py-1 pr-3 whitespace-nowrap">
                      <span class="inline-block w-12 text-pencil">{instruction.operands}</span>
                      {instruction.does}
                    </td>
                    <td class="py-1 pr-3">
                      <input
                        class={`w-20 border-0 border-b-2 bg-transparent px-1 font-bold tracking-label text-ink uppercase outline-none focus:bg-wash ${underline(problems().mnemonic)}`}
                        aria-label={`Mnemonic for ${id}`}
                        data-field="mnemonic"
                        maxLength={MAX_MNEMONIC}
                        spellcheck={false}
                        autocomplete="off"
                        value={row().mnemonic}
                        onInput={(event) => {
                          edit({ [id]: { ...row(), mnemonic: event.currentTarget.value } });
                        }}
                      />
                    </td>
                    <td class="py-1 pr-3">
                      <select
                        class={`border-0 border-b-2 bg-transparent px-1 text-ink tabular-nums outline-none focus:bg-wash ${underline(problems().opcode)}`}
                        aria-label={`Opcode for ${id}`}
                        data-field="opcode"
                        value={row().opcode ?? ""}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          edit({ [id]: { ...row(), opcode: value === "" ? null : Number(value) } });
                        }}
                      >
                        <option value="">–</option>
                        <For each={OPCODE_LIST}>
                          {(n) => (
                            <option value={n}>
                              {n} · {binary(n)}
                            </option>
                          )}
                        </For>
                      </select>
                    </td>
                    <td class="py-1 pr-3">
                      <button
                        class="btn btn-sm btn-ghost whitespace-nowrap"
                        data-use-bitbox={id}
                        onClick={() => {
                          edit(pick(id));
                        }}
                      >
                        Use Bitbox's
                      </button>
                    </td>
                    <td class="py-1 text-xs font-bold whitespace-nowrap text-fail">{reason()}</td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>

      <p
        id="table-status"
        class={`shrink-0 border-t-2 border-ink pt-2 font-bold ${check().solved ? "text-pass" : "text-ink"}`}
      >
        {check().good} of {INSTRUCTIONS.length} rows good · spare opcode{check().spare.length === 1 ? "" : "s"}:{" "}
        {spare()}
      </p>
    </section>
  );
}

// A row of old typewriters, with Bitbox sitting at one, in drafting ink.
function Typewriters(props: { class?: string }): JSX.Element {
  const desks = [0, 1, 2, 3];
  return (
    <svg
      viewBox="0 0 64 16"
      class={props.class}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="0.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <For each={desks}>
        {(i) => (
          <g transform={`translate(${i * 16} 0)`}>
            {/* The roller, the body and its keys. */}
            <path d="M3 8.5h10M2.5 7.5v2M13.5 7.5v2" />
            <path d="M2 10h12l1 4H1z" fill="var(--color-surface)" />
            <path d="M4 12h1M6.5 12h1M9 12h1M11.5 12h1" />
            <path d="M5 8.5V6h6v2.5" />
          </g>
        )}
      </For>
      {/* Bitbox at the second typewriter: a square head with eyes and an antenna. */}
      <g transform="translate(16 0)">
        <rect x="5" y="1.5" width="6" height="4.5" fill="var(--color-surface)" />
        <path d="M8 1.5V0.3" />
        <circle cx="6.8" cy="3.6" r="0.5" fill="currentColor" />
        <circle cx="9.2" cy="3.6" r="0.5" fill="currentColor" />
      </g>
    </svg>
  );
}
