{ bun2nix, ... }:
let
  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.nix;
  };
in
bun2nix.mkDerivation {
  pname = "nyaa";
  version = "1.0.0";
  src = ./.;
  inherit bunDeps;
  module = "index.ts";
}
