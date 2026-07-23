import { createMachine, createActor, assign } from 'xstate';

const machine = createMachine({
  id: 'nav',
  initial: 'idle',
  context: { currentRoute: '/', history: [], params: {} },
  states: {
    idle: {
      on: {
        NAVIGATE: {
          target: 'navigating',
          actions: assign({
            currentRoute: ({ event }) => event.route || '/',
            history: ({ context }) => [...context.history, context.currentRoute]
          })
        }
      }
    },
    navigating: {
      on: {
        NAVIGATE_COMPLETE: { target: 'idle' }
      }
    }
  }
});

const actor = createActor(machine);
actor.start();

console.log('Initial state:', actor.getSnapshot().value);

actor.send({ type: 'NAVIGATE', route: '/about' });
console.log('After NAVIGATE:', actor.getSnapshot().value);
console.log('Context:', actor.getSnapshot().context);

actor.send({ type: 'NAVIGATE_COMPLETE' });
console.log('After NAVIGATE_COMPLETE:', actor.getSnapshot().value);
