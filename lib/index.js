// dsh-indexbookmark host half: intentionally minimal. The real work happens in
// the browser bundle (lib/client.js). The Loader mounts this plugin so the
// `dsh.client` declaration in package.json is discovered and served.
const name = 'dsh-indexbookmark';
function apply() {
  // No host-side services needed for a pure client UI plugin.
}
export { apply, name };
