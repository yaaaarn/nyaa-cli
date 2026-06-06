{
  description = "nyaa-cli - a simple nyaa.si cli client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    { self, nixpkgs, flake-utils, bun2nix }@inputs:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        bun2nix' = bun2nix.packages.${system}.default;
      in
      {
        packages.default = pkgs.callPackage ./default.nix { bun2nix = bun2nix'; };
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            glow
            xdg-utils
            bun2nix'
          ];
        };
      }
    );
}
