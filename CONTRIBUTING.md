# Contributing to Hypermind

So you want to ~~become one with the Hypermind~~ contribute? Excellent. Your dedication to pointlessness is admirable.

## Ways to Contribute

### Reporting Bugs

Found a bug? Open an [issue](https://github.com/lklynet/hypermind/issues) with:

- A clear description of what went wrong
- Steps to reproduce
- Your environment (OS, Node version, Docker version if applicable)

### Suggesting Features

Have an idea to make this gloriously useless project even more elaborate? Open an issue and describe:

- What you want to add
- Why it would be (hilariously) useful
- Any implementation ideas you have

### Code Contributions

Ready to write some code? Follow the setup below and submit a PR.

## Development Setup

### Prerequisites

- **Node.js 20+** (we use the built-in test runner)
- **npm** for package management

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/hypermind.git
cd hypermind

# Install dependencies
npm install
```

### Running Locally

```bash
# Start the server
npm start

# Or with a custom port
PORT=3001 npm start
```

To simulate having friends (multiple nodes):

```bash
# Terminal 1
PORT=3000 npm start

# Terminal 2
PORT=3001 npm start
```

They'll discover each other, and the count becomes 2. Congratulations, you're popular.

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting. No ESLint. No Prettier. Just Biome.

### Conventions

- **Indent:** 2 spaces
- **Quotes:** Double quotes (`"like this"`)
- **Semicolons:** Always
- **Line width:** 100 characters

### Commands

```bash
# Check everything (lint + format)
npm run check

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

Run `npm run check` before committing. The CI will catch you if you don't.

## Testing

### Unit Tests

```bash
npm test
```

Uses Node.js built-in test runner. Tests live in `tests/*.test.js`.

Touching something in the critical path? Write a test or prepare to explain yourself to the swarm.

### Network Tests

```bash
npm run test:network
```

Spins up a server and verifies the API endpoints work.

### Before Submitting

All tests must pass. The CI pipeline runs:

1. `npm run check` (lint + format)
2. `npm test` (unit tests)
3. `npm run test:network` (API tests)

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/my-thing`)
3. **Make your changes** and commit them
4. **Push** to your fork
5. **Open a PR** against `main`

### PR Requirements

- All CI checks must pass
- Keep changes focused. One feature or fix per PR.
- Update documentation if needed

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thanks for contributing to the swarm. May your node count ever increase. 🐝
