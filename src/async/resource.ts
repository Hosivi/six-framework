// resource — async data as a reactive primitive (the createResource of sx).
//
// Built on signal + effect: an effect tracks `source`; when it changes (or
// refetch() is called) it runs the async `fetcher` and writes the result into
// loading/error/data signals, which the view reads fine-grained. Stale results
// from a superseded fetch are dropped (generation guard). No re-render.
//
//   const user = resource(userId, (id) => fetchUser(id));
//   user();          // T | undefined
//   user.loading();  // boolean
//   user.error();    // unknown | null
//   user.refetch();  // force a reload
//   user.mutate(u);  // overwrite locally (optimistic) without fetching
//   user.match({ loading: () => ..., error: (e) => ..., ready: (u) => ... });

import { signal, effect, untrack, onCleanup } from "../reactive/index";
import { when } from "../dom/control";
import type { SxNode, DynamicChild } from "../dom/types";

export interface ResourceOptions<T> {
  /** Value exposed before the first fetch resolves. */
  initialValue?: T;
}

export interface ResourceFetcherContext {
  signal: AbortSignal;
}

export interface Resource<T> {
  (): T | undefined;
  loading(): boolean;
  error(): unknown;
  refetch(): void;
  /**
   * Overwrite the value locally without fetching (optimistic updates).
   * Accepts a value or an updater. The next refetch / source change wins.
   * Caveat: if `T` is itself a function, pass the value, not an updater.
   */
  mutate(next: T | ((prev: T | undefined) => T)): void;
  /** Render one of the three states as a reactive region. */
  match(arms: {
    loading: () => SxNode;
    error: (error: unknown) => SxNode;
    ready: (data: T) => SxNode;
  }): DynamicChild;
}

export function resource<T>(
  fetcher: (_value?: true, context?: ResourceFetcherContext) => Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T>;
export function resource<S, T>(
  source: () => S,
  fetcher: (value: S, context?: ResourceFetcherContext) => Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T>;
export function resource<S, T>(
  sourceOrFetcher: (() => S) | (() => Promise<T>),
  fetcherOrOptions?: ((value: S, context?: ResourceFetcherContext) => Promise<T>) | ResourceOptions<T>,
  maybeOptions?: ResourceOptions<T>,
): Resource<T> {
  const hasSource = typeof fetcherOrOptions === "function";
  const source = (hasSource ? sourceOrFetcher : () => true) as () => S;
  const fetcher = (
    hasSource ? fetcherOrOptions : sourceOrFetcher
  ) as (value: S, context?: ResourceFetcherContext) => Promise<T>;
  const options = (hasSource ? maybeOptions : fetcherOrOptions) as
    | ResourceOptions<T>
    | undefined;

  const data = signal<T | undefined>(options?.initialValue);
  const loading = signal(false);
  const failure = signal<unknown>(null);
  const refetchTick = signal(0);
  let generation = 0;
  let controller: AbortController | null = null;
  let disposed = false;

  const abortInFlight = (): void => {
    generation++;
    controller?.abort();
    controller = null;
  };

  onCleanup(() => {
    disposed = true;
    abortInFlight();
    loading.set(false);
  });

  effect(() => {
    if (disposed) return;
    const value = source();
    refetchTick(); // tracked: bumping it forces a refetch
    // Gating: a null/undefined/false source skips the fetch entirely.
    if (value === null || value === undefined || (value as unknown) === false) {
      abortInFlight();
      loading.set(false);
      failure.set(null);
      return;
    }
    abortInFlight();
    const gen = generation;
    loading.set(true);
    failure.set(null);
    controller = typeof AbortController === "function" ? new AbortController() : null;
    const fetchContext = controller ? { signal: controller.signal } : undefined;
    untrack(() => {
      fetcher(value, fetchContext).then(
        (result) => {
          if (disposed || gen !== generation) return; // a newer fetch superseded this one
          controller = null;
          data.set(result);
          loading.set(false);
        },
        (err: unknown) => {
          if (disposed || gen !== generation) return;
          controller = null;
          failure.set(err);
          loading.set(false);
        },
      );
    });
  });

  const out = (() => data()) as Resource<T>;
  out.loading = () => loading();
  out.error = () => failure();
  out.refetch = () => refetchTick.update((n) => n + 1);
  out.mutate = (next) => {
    const value =
      typeof next === "function"
        ? (next as (prev: T | undefined) => T)(untrack(() => data()))
        : next;
    data.set(value);
  };
  out.match = (arms) =>
    when(
      () => loading(),
      () => arms.loading(),
      () =>
        failure() !== null ? arms.error(failure()) : arms.ready(data() as T),
    );

  return out;
}
