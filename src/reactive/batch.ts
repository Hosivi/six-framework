// Batch multiple writes so dependent effects run once at the end instead of
// once per write.
//
//   batch(() => {
//     count.set(1);
//     count.set(2);
//     count.set(3);
//   });
//   // effects that read `count` run a single time, seeing 3.
export { batch } from "./graph";
