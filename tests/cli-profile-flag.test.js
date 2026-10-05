import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// `.option('--profile, --org <name>')` is stored by commander as `opts().org`,
// not `opts().profile`. 0.2.0's committed source read `profile`, so the flag
// silently did nothing and commands ran against the current profile.
const setOrgOverride = jest.fn();
jest.unstable_mockModule('../src/cli/config-store.js', () => ({
  setOrgOverride,
  loadConfig: jest.fn(),
  saveConfig: jest.fn(),
  addOrg: jest.fn(),
  removeOrg: jest.fn(),
  useOrg: jest.fn(),
  configPath: jest.fn(),
  listProfiles: jest.fn(),
  resolveCredentials: jest.fn(),
  describeCurrent: jest.fn(),
}));

const { run } = await import('../src/cli/index.js');

describe('--profile / --org global flag', () => {
  beforeEach(() => {
    setOrgOverride.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it.each(['--profile', '--org'])('%s sets the org override', (flag) => {
    run([flag, 'x', 'getting-started']);
    expect(setOrgOverride).toHaveBeenCalledWith('x');
  });

  it('leaves the override alone when neither flag is given', () => {
    run(['getting-started']);
    expect(setOrgOverride).not.toHaveBeenCalled();
  });
});
