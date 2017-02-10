import R from 'ramda';
import { Either, Maybe } from 'ramda-fantasy';

import * as CONST from './constants';
import * as Tools from './func-tools';
import * as Utils from './utils';
import * as Patch from './patch';
import * as Node from './node';
import * as Link from './link';

/**
 * Root of a project’s state tree
 * @typedef {Object} Project
 */

 /**
  * Archived project state
  * @typedef {Object} Xodball
  */

/**
 * @function createProject
 * @returns {Project} newly created project
 */
export const createProject = () => ({
  authors: [],
  description: '',
  license: '',
  patches: {},
});

/**
 * @function getProjectDescription
 * @param {Project} project
 * @returns {string}
 */
export const getProjectDescription = R.propOr('', 'description');

/**
 * @function setProjectDescription
 * @param {string} description
 * @param {Project} project
 * @returns {Project}
 */
export const setProjectDescription = Tools.assocString('description');

/**
 * @function getProjectAuthors
 * @param {Project} project
 * @returns {string[]}
 */
export const getProjectAuthors = R.propOr([], 'authors');

/**
 * @function setProjectAuthors
 * @param {string[]} authors
 * @param {Project} project
 * @returns {Project}
 */
export const setProjectAuthors = R.useWith(
  R.assoc('authors'),
  [
    R.ifElse(
      R.is(Array),
      R.map(String),
      R.compose(
        R.flip(R.append)([]),
        String
      )
    ),
    R.identity,
  ]
);

/**
 * @function getProjectLicense
 * @param {Project} project
 * @returns {string}
 */
export const getProjectLicense = R.propOr('', 'license');

/**
 * @function setProjectLicense
 * @param {string} value
 * @param {Project} project
 * @returns {Project}
 */
export const setProjectLicense = Tools.assocString('license');

/**
 * Converts project into Xodball: remove library patches, replace it with dependency list and etc.
 *
 * This functions validates project before archiving it and may return error of validation.
 *
 * NOT IMPLEMENTED YET
 *
 * @function archiveProject
 * @param {Project} project
 * @returns {Either<Error|Xodball>}
 */
// TODO: Implement it!
export const archiveProject = () => {};

 /**
  * Checks `project` for validity.
  *
  * Check would fail in either case:
  * - JSON Schema test fails
  * - one of other validate function fails
  *
  * NOT IMPLEMENTED YET
  *
  * @function validateProject
  * @param {Project} project - project to operate on
  * @returns {Either<Error|Project>} validation result
  */
// TODO: Implement it!
export const validateProject = project => Either.Right(project);

// =============================================================================
//
// Patches
//
// =============================================================================

/**
 * @private
 * @function getPatches
 * @param {Project} project - project bundle
 * @returns {Patches} object with patches stored by path
 */
export const getPatches = R.propOr({}, 'patches');

/**
 * @function listPatches
 * @param {Project} project - project bundle
 * @returns {Patch[]} list of all patches not sorted in any arbitrary order
 */
export const listPatches = R.compose(
  R.values,
  getPatches
);

/**
 * Returns a list of paths to patches in the project.
 *
 * @function listPatchPaths
 * @param {Project} project - project bundle
 * @returns {String[]} list of all patch paths not sorted in any arbitrary order
 */
export const listPatchPaths = R.compose(
  R.keys,
  getPatches
);

/**
 * Return a list of local patches (excluding external libraries)
 *
 * @function listLocalPatches
 * @param {Project} project
 * @returns {Patch[]}
 */
export const listLocalPatches = R.compose(
  R.filter(
    R.propSatisfies(Utils.isPathLocal, 'path')
  ),
  listPatches
);

/**
 * Return a list of library patches (excluding local patches)
 *
 * @function listLibraryPatches
 * @param {Project} project
 * @returns {Patch[]}
 */
export const listLibraryPatches = R.compose(
  R.filter(
    R.propSatisfies(Utils.isPathLibrary, 'path')
  ),
  listPatches
);

/**
 * @function getPatchByPath
 * @param {string} path - full path of the patch to find, e.g. `"@/foo/bar"`
 * @param {Project} project - project bundle
 * @returns {Maybe<Patch>} a patch with given path or Null if it wasn’t found
 */
export const getPatchByPath = R.curry(
  (path, project) =>
  R.compose(
    Tools.prop(path),
    getPatches
  )(project)
);

/**
 * Checks project for existance of patches and pins that used in link.
 *
 * @private
 * @function checkPinKeys
 * @param {Link} link
 * @param {Patch} patch
 * @param {Project} project
 * @returns {Either<Error|Link>}
 */
const checkPinKeys = (link, patch, project) => {
  // TODO: Move check function and child functions on the top-level
  const check = (nodeIdGetter, pinKeyGetter) => {
    const pinKey = pinKeyGetter(link);
    // :: patch -> Either
    const checkPinExists = R.compose(
      Tools.errOnNothing(CONST.ERROR.PINS_NOT_FOUND),
      Patch.getPinByKey(pinKey)
    );
    // :: node -> Either
    const checkTypeExists = R.compose(
      Tools.errOnNothing(CONST.ERROR.TYPE_NOT_FOUND),
      getPatchByPath(R.__, project),
      Node.getNodeType
    );
    // :: link -> Either
    const checkNodeExists = R.curry(R.compose(
      Tools.errOnNothing(CONST.ERROR.NODE_NOT_FOUND),
      Patch.getNodeById(R.__, patch),
      nodeIdGetter
    ));

    return R.compose(
      R.chain(checkPinExists),
      R.chain(checkTypeExists),
      checkNodeExists
    )(link);
  };

  return check(Link.getLinkInputNodeId, Link.getLinkInputPinKey).chain(
    () => check(Link.getLinkOutputNodeId, Link.getLinkOutputPinKey)
  ).map(R.always(patch));
};

/**
 * Checks `patch` content to be valid:
 *
 * - all nodes have existent types (patches),
 * - valid pinKeys in the links
 * @function validatePatchContents
 * @param {Patch} patch
 * @param {Project} project
 * @returns {Either<Error|Patch>}
 */
// TODO: Try to simplify this mess :-D
export const validatePatchContents = R.curry(
  (patch, project) => {
    // :: patch -> Either
    const checkNodeTypes = R.compose(
      R.ifElse(
        R.equals(false),
        Tools.err(CONST.ERROR.TYPE_NOT_FOUND),
        R.always(Either.of(patch))
      ),
      R.all(Maybe.isJust),
      R.chain(
        R.compose(
          getPatchByPath(R.__, project),
          Node.getNodeType
        )
      ),
      Patch.listNodes
    );
    // :: patch -> Either
    const checkLinks = R.compose(
      R.ifElse(
        R.compose(
          R.gt(R.__, 0),
          R.length
        ),
        R.compose(
          R.prop(0),
          R.chain(R.partialRight(checkPinKeys, [patch, project]))
        ),
        R.always(
          Either.of(patch)
        )
      ),
      Patch.listLinks
    );

    return checkNodeTypes(patch).chain(checkLinks);
  }
);

/**
 * Inserts or updates the `patch` within the `project`.
 *
 * Matching is done by patch’es path.
 *
 * @function assocPatch
 * @param {string} path
 * @param {Patch} patch - patch to insert or update
 * @param {Project} project - project to operate on
 * @returns {Either<Error|Project>} copy of the project with the updated patch
 */
// TODO: Refactoring needed
export const assocPatch = R.curry((path, patch, project) =>
  Utils.validatePath(path).chain(
    validPath => Patch.validatePatch(patch).chain(
      validPatch => validatePatchContents(validPatch, project).map(
        R.assocPath(['patches', validPath], R.__, project)
      )
    )
  )
);

/**
 * Removes the `patch` from the `project`.
 *
 * Does nothing if the `patch` not found in `project`.
 *
 * @function dissocPatch
 * @param {string} path - path to patch to remove
 * @param {Project} project - project to operate on
 * @returns {Project} copy of the project with the patch removed
 */
export const dissocPatch = R.curry((path, project) =>
  R.dissocPath(['patches', path], project)
);

const doesPathExist = R.curry(R.compose(
  Maybe.isJust,
  getPatchByPath
));

/**
 * Checks if a `patch` could be safely renamed given a new path.
 *
 * Check would fail in either case:
 * - `newPath` contains invalid characters
 * - `patch` is not in the `project`
 * - another patch with same path already exist
 *
 * @function validatePatchRebase
 * @param {string} newPath - new path for the patch
 * @param {string} oldPath - path to patch to rename
 * @param {Project} project - project to operate on
 * @returns {Either<Error|Project>} validation result
 */
export const validatePatchRebase = R.curry(
  (newPath, oldPath, project) => Utils.validatePath(newPath)
    .chain(Tools.errOnFalse(
      CONST.ERROR.PATCH_PATH_OCCUPIED,
      R.complement(doesPathExist(R.__, project))
    ))
    .chain(() => Tools.errOnNothing(
      CONST.ERROR.PATCH_NOT_FOUND_BY_PATH,
      getPatchByPath(oldPath, project)
    ))
    .map(R.always(project))
);

/**
 * Updates the `patch` in the `project` relocating it to a new path.
 *
 * Note that rebase will affect patch’es path that is used as its ID.
 *
 * All references to the patch from other patches will be set to
 * the new path.
 *
 * @function rebasePatch
 * @param {string} newPath - new path for the patch
 * @param {string} oldPath - old path for the patch
 * @param {Project} project - project to operate on
 * @returns {Either<Error|Project>} copy of the project with the patch renamed
 * @see {@link validatePatchRebase}
 */
export const rebasePatch = R.curry(
  (newPath, oldPath, project) =>
    validatePatchRebase(newPath, oldPath, project)
      .map(
        (proj) => {
          const patch = getPatchByPath(oldPath, proj);
          const assocThatPatch = patch.chain(R.assocPath(['patches', newPath]));

          // TODO: Think about refactoring that piece of code :-D
          // Patch -> Patch
          const updateReferences = R.when(
            R.has('nodes'),
            R.evolve({
              nodes: R.mapObjIndexed(
                R.when(
                  R.propEq('type', oldPath),
                  R.assoc('type', newPath)
                )
              ),
            })
          );

          return R.compose(
            R.evolve({
              patches: R.mapObjIndexed(updateReferences),
            }),
            R.dissocPath(['patches', oldPath]),
            assocThatPatch
          )(proj);
        }
      )
);

// =============================================================================
//
// Virtual directories
//
// =============================================================================

/**
 * Returns list of patches in the specified directory.
 *
 * @function lsPatches
 * @param {string} path
 * @param {Project} project
 * @returns {Patch[]}
 */
export const lsPatches = R.curry(
  (path, project) => {
    const slashedPath = Utils.ensureEndsWithSlash(path);
    const reg = new RegExp(`^${slashedPath}([a-zA-Z0-9_-])+$`);

    return R.compose(
      R.pickBy((val, key) => R.test(reg, key)),
      getPatches
    )(project);
  }
);

/**
 * Returns list of directories in the specified directory.
 *
 * @function lsDirs
 * @param {string} path
 * @param {Project} project
 * @returns {string[]}
 */
export const lsDirs = R.curry(
  (path, project) => {
    const slashedPath = Utils.ensureEndsWithSlash(path);
    const reg = new RegExp(`^${slashedPath}([a-zA-Z0-9_-]+)(?:/).*`);

    return R.compose(
      R.uniq,
      R.reject(R.isNil),
      R.map(
        R.compose(
          R.nth(1),
          R.match(reg)
        )
      ),
      R.keys,
      getPatches
    )(project);
  }
);