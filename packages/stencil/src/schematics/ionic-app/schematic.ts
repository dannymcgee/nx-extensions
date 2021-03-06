import {
  apply,
  applyTemplates,
  chain, externalSchematic,
  mergeWith,
  move,
  Rule, SchematicContext,
  Tree,
  url
} from '@angular-devkit/schematics';
import {
  addDepsToPackageJson,
  addPackageWithInit,
  addProjectToNxJsonInTree,
  formatFiles,
  names,
  offsetFromRoot,
  ProjectType,
  toFileName, updateJsonInTree,
  updateWorkspace
} from '@nrwl/workspace';
import { IonicAppSchema } from './schema';
import { AppType } from '../../utils/typings';
import { addDefaultBuilders, calculateStyle } from '../../utils/utils';
import core from '../core/core';
import { appsDir } from '@nrwl/workspace/src/utils/ast-utils';
import { stripIndents } from '@angular-devkit/core/src/utils/literals';

const projectType = ProjectType.Application;

function normalizeOptions(options: IonicAppSchema, host: Tree): IonicAppSchema {
  const name = toFileName(options.name);
  const projectDirectory = options.directory
    ? `${toFileName(options.directory)}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${appsDir(host)}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  const style = calculateStyle(options.style);
  const appType = AppType.CapacitorApp;
  const appTemplate = toFileName(options.appTemplate);
  const capAppName = `${projectName}-cap`;

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    style,
    appType,
    appTemplate,
    capAppName
  } as IonicAppSchema;
}

function addFiles(options: IonicAppSchema): Rule {
  return mergeWith(
    apply(url(`./files/${options.appTemplate}`), [
      applyTemplates({
        ...options,
        ...names(options.name),
        offsetFromRoot: offsetFromRoot(options.projectRoot)
      }),
      move(options.projectRoot),
      formatFiles({ skipFormat: false })
    ])
  );
}

function showInformation(options: IonicAppSchema): Rule {
  return (host: Tree, context: SchematicContext) => {
    context.logger.info(stripIndents`
      You need to build '${options.projectName}' first.
      nx build ${options.projectName}

      After that you're able to add the native platforms to the Capacitor project

      Android: nx run ${options.capAppName}:add --platform android
      iOS:     nx run ${options.capAppName}:add --platform ios

      Now you're done and ready to run the project

      Android: nx run ${options.capAppName}:open --platform android
      iOS:     nx run ${options.capAppName}:open --platform ios

      The documentation for the nx capacitor plugin is here:
      https://nxtend.dev/docs/capacitor/overview

      Build something awesome!
    `);
  };
}

export default function(options: IonicAppSchema): Rule {
  return (host: Tree) => {
    const normalizedOptions = normalizeOptions(options, host);
    return chain([
      core(normalizedOptions),
      updateWorkspace((workspace) => {
        const targetCollection = workspace.projects.add({
          name: normalizedOptions.projectName,
          root: normalizedOptions.projectRoot,
          sourceRoot: `${normalizedOptions.projectRoot}/src`,
          projectType,
          schematics: {
            '@nxext/stencil:component': {
              style: options.style,
              storybook: false
            }
          }
        }).targets;
        addDefaultBuilders(
          targetCollection,
          projectType,
          normalizedOptions
        );
      }),
      addProjectToNxJsonInTree(normalizedOptions.projectName, {
        tags: normalizedOptions.parsedTags
      }),
      addFiles(normalizedOptions),
      addDepsToPackageJson({}, {"@nxtend/capacitor": "^1.0.0"}),
      addPackageWithInit('@nxtend/capacitor'),
      externalSchematic('@nxtend/capacitor', 'capacitor-project', {
        name: normalizedOptions.capAppName,
        project: normalizedOptions.projectName
      }),
      updateJsonInTree(`${appsDir(host)}/${normalizedOptions.capAppName}/capacitor.config.json`, json => {
        json.webDir = `${json.webDir}/www`;

        return json;
      }),
      showInformation(normalizedOptions)
    ]);
  };
}
