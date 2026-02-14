use crate::graphics::GraphicsSystem;
use crate::content::ContentSystem;
use crate::interaction::InteractionSystem;
use crate::effects::EffectsSystem;
use crate::network::NetworkSystem;

#[derive(Debug)]
pub enum EngineError {
    Graphics(String),
    Content(String),
    Interaction(String),
    Effects(String),
    Network(String),
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineError::Graphics(msg) => write!(f, "Graphics Error: {}", msg),
            EngineError::Content(msg) => write!(f, "Content Error: {}", msg),
            EngineError::Interaction(msg) => write!(f, "Interaction Error: {}", msg),
            EngineError::Effects(msg) => write!(f, "Effects Error: {}", msg),
            EngineError::Network(msg) => write!(f, "Network Error: {}", msg),
        }
    }
}

impl From<String> for EngineError {
    fn from(msg: String) -> Self {
        EngineError::Content(msg)
    }
}

impl From<EngineError> for wasm_bindgen::JsValue {
    fn from(error: EngineError) -> Self {
        wasm_bindgen::JsValue::from_str(&error.to_string())
    }
}

pub struct Engine {
    graphics: GraphicsSystem,
    content: ContentSystem,
    interaction: InteractionSystem,
    effects: EffectsSystem,
    network: NetworkSystem,
}

impl Engine {
    pub fn new(canvas: &web_sys::HtmlCanvasElement) -> Result<Self, EngineError> {
        let graphics = GraphicsSystem::new(canvas)
            .map_err(|e| EngineError::Graphics(e))?;
        
        let content = ContentSystem::new();
        let interaction = InteractionSystem::new();
        let effects = EffectsSystem::new(canvas)
            .map_err(|e| EngineError::Effects(e))?;
        let network = NetworkSystem::new();

        Ok(Self {
            graphics,
            content,
            interaction,
            effects,
            network,
        })
    }

    pub fn render(&mut self) -> Result<(), EngineError> {
        let scene = self.content.current_scene();
        self.graphics.render(&scene)
            .map_err(|e| EngineError::Graphics(e))?;
        
        self.effects.apply_lighting(&mut self.graphics)
            .map_err(|e| EngineError::Effects(e))?;
        
        Ok(())
    }

    pub fn handle_input(&mut self, input_events: Vec<crate::interaction::InputEvent>) -> Result<(), EngineError> {
        let actions = self.interaction.process_input_batch(input_events)
            .map_err(|e| EngineError::Interaction(e))?;
        
        for action in actions {
            self.content.apply_action(action)?;
        }
        
        Ok(())
    }

    pub fn resize(&mut self, width: f32, height: f32) -> Result<(), EngineError> {
        self.graphics.resize(width, height)
            .map_err(|e| EngineError::Graphics(e))?;
        Ok(())
    }

    pub fn graphics(&mut self) -> &mut GraphicsSystem {
        &mut self.graphics
    }

    pub fn content(&mut self) -> &mut ContentSystem {
        &mut self.content
    }

    pub fn interaction(&mut self) -> &mut InteractionSystem {
        &mut self.interaction
    }

    pub fn effects(&mut self) -> &mut EffectsSystem {
        &mut self.effects
    }

    pub fn network(&mut self) -> &mut NetworkSystem {
        &mut self.network
    }
}