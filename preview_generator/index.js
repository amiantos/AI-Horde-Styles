const config = require("./config.json");
const { AIHorde } = require("@zeldafan0225/ai_horde");
const { setTimeout } = require("node:timers/promises");
const fs = require("fs");
const styles = require("../styles.json");
const request = require("request");

const baseRequest = {
  models: ["stable_diffusion"],
  prompt: "",
  params: {
    steps: 30,
    post_processing: [],
    cfg_scale: 5,
    hires_fix: true,
    clip_skip: 1,
    width: 1024,
    image_is_control: false,
    height: 1024,
    tiling: false,
    karras: true,
    sampler_name: "k_dpmpp_sde",
    n: 1,
    denoising_strength: 0.75,
    facefixer_strength: 0.75,
  },
  censor_nsfw: false,
  shared: true,
  replacement_filter: true,
  dry_run: false,
  r2: true,
  nsfw: true,
  trusted_workers: true,
  slow_workers: false,
};

const promptSamples = {
  person: "a man drinking coffee at the kitchen table in the morning",
  place: "a view of the city of New York at night",
  thing: "a red car parked on the side of the road",
};

const main = async () => {
  console.log(
    "Lo! I am the preview generator. On a mountain of skulls, in the castle of pain, I sat on a throne of blood!"
  );

  hordeAPIKey = config.ai_horde_api_key;
  if (hordeAPIKey == null) {
    console.log("No AI Horde API key found. This will be slow...");
  }
  const models = await new Promise((resolve, reject) => {
    request.get(
      "https://raw.githubusercontent.com/Haidra-Org/AI-Horde-image-model-reference/main/stable_diffusion.json",
      (error, response, body) => {
        if (error) {
          reject(error);
        }
        resolve(JSON.parse(body));
      }
    );
  });

  // clear previews.md file content
  fs.writeFileSync("previews.md", "# Style Previews\n---\n\n");

  // to generate all styles
  for (const [styleName, styleContents] of Object.entries(styles)) {
    await generateImagesForStyle(styleName, styleContents, models);
  }
  console.log("I am finished!");
};

async function generateImagesForStyle(styleName, styleContent, models) {
  // Check for model in model reference file
  if (!(styleContent.model in models)) {
    console.log("Invalid model: " + styleContent.model);
    return;
  }

  // Get model baseline to determine configuration
  const model = models[styleContent.model];
  const modelBaseline = model.baseline;

  console.log("Generating preview for style: " + styleName);

  console.log(styleContent);

  var styleRequest = structuredClone(baseRequest);
  if (styleContent.model != null) {
    styleRequest.models = [styleContent.model];
  }
  if (styleContent.steps != null) {
    styleRequest.params.steps = styleContent.steps;
  }
  if (styleContent.width != null) {
    styleRequest.params.width = styleContent.width;
  }
  if (styleContent.height != null) {
    styleRequest.params.height = styleContent.height;
  }
  if (styleContent.cfg_scale != null) {
    styleRequest.params.cfg_scale = styleContent.cfg_scale;
  }
  if (styleContent.sampler_name != null) {
    styleRequest.params.sampler_name = styleContent.sampler_name;
  }
  if (styleContent.loras != null) {
    styleRequest.params.loras = styleContent.loras;
  }
  if (styleContent.tis != null) {
    styleRequest.params.tis = styleContent.tis;
  }

  if (modelBaseline.includes("stable_diffusion_xl")) {
    console.log("Using XL model, disabling hires_fix");
    styleRequest.params.hires_fix = false;
  }

  console.log("Generating images for style: " + styleName);
  const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();

  // generate images for each promptSample
  for (const [promptType, promptSample] of Object.entries(promptSamples)) {
    const fileName = safeStyleName + "_" + promptType + ".webp";
    if (fs.existsSync("images/" + fileName)) {
      console.log("Skipping " + promptType + " as it already exists.");
      continue;
    }

    styleRequest.prompt = promptSample;
    if (styleContent.prompt != null) {
      styleRequest.prompt = styleContent.prompt
        .replace("{p}", styleRequest.prompt)
        .replace("{np}", "");
    }
    console.log("Generating prompt: '" + styleRequest.prompt + "'");
    const results = await generateImages(styleRequest);
    for (const result of results) {
      await saveResult(result, fileName);
      console.log(promptType + " saved.");
      break;
    }
  }

  // write style to previews.md
  fs.appendFileSync(
    "previews.md",
    `## ${styleName}\n| person | place | thing |\n| --- | --- | --- |\n| ![${styleName} person preview](/preview_generator/images/${safeStyleName}_person.webp?raw=true) | ![${styleName} place preview](/preview_generator/images/${safeStyleName}_place.webp?raw=true) | ![${styleName} thing preview](/preview_generator/images/${safeStyleName}_thing.webp?raw=true) |\n`
  );
}

async function saveResult(imageObject, fileName) {
  const imageResponse = await fetch(imageObject.url);
  const imageBuffer = await imageResponse.arrayBuffer();
  fs.writeFileSync("images/" + fileName, Buffer.from(imageBuffer));
}

async function generateImages(request) {
  const apiKey = config.ai_horde_api_key;
  const ai_horde = new AIHorde({
    client_agent: config.client_agent,
    default_token: apiKey,
  });

  // start the generation of an image with the given payload
  const generation = await ai_horde.postAsyncImageGenerate(request);
  console.log(
    "Generation Submitted, ID: " +
      generation.id +
      ", kudos cost: " +
      generation.kudos
  );

  while (true) {
    const check = await ai_horde.getImageGenerationCheck(generation.id);
    console.log(
      "Q#:" +
        check.queue_position +
        " W:" +
        check.waiting +
        " P:" +
        check.processing +
        " F:" +
        check.finished
    );
    if (check.done) {
      console.log("Generation complete.");
      break;
    }
    await setTimeout(3000);
  }

  const generationResult = await ai_horde.getImageGenerationStatus(
    generation.id
  );

  var results = [];
  for (const result of generationResult.generations) {
    if (result.censored) {
      console.error("Censored image detected! Image discarded...");
    } else {
      results.push({ id: result.id, url: result.img });
    }
  }

  return results;
}

main();
