#!/bin/bash

# Create a new Rust project
cargo new safari_suggestions
cd safari_suggestions

# Add dependencies
cargo add clap --features derive
cargo add serde --features derive
cargo add serde_json
cargo add reqwest --features json
cargo add tokio --features full

# Create the main.rs file
cat > src/main.rs << EOL
use clap::Parser;
use serde_json::Value;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    query: String,
    
    #[arg(short, long, default_value = "puffin1758")]
    key: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    
    let client = reqwest::Client::new();
    let response = client.get("https://api-glb-ause1b.smoot.apple.com/search")
        .query(&[
            ("cc", "US"),
            ("esl", "en"),
            ("key", &args.key),
            ("locale", "en_US"),
            ("q", &args.query),
        ])
        .header("accept", "*/*")
        .header("accept-language", "en-US,en;q=0.9")
        .header("user-agent", "parsecd/1 (Mac15,12; macOS 14.5 23F79) safari/1")
        .header("x-apple-languages", "[\"en-US\"]")
        .send()
        .await?
        .json::<Value>()
        .await?;

    if let Some(array) = response.as_array() {
        for item in array {
            if let Some(results) = item["results"].as_array() {
                for result in results {
                    if let (Some(section_header), Some(completion)) = (
                        result["section_header"].as_str(),
                        result["completion"].as_str(),
                    ) {
                        if section_header == "Siri Suggested Website" {
                            println!("{}", completion);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
EOL

# Build the project
cargo build

echo "Rust project 'safari_suggestions' has been created and built successfully."
echo "You can run it with: cargo run -- --query <your_query>"