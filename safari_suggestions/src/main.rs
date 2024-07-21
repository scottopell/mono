use clap::Parser;
use colored::*;
use serde_json::Value;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    query: String,

    #[arg(short, long, default_value = "puffin1758")]
    key: String,

    #[arg(short, long)]
    verbose: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    let client = reqwest::Client::new();
    let url = "https://api-glb-ause1b.smoot.apple.com/search";

    if args.verbose {
        println!("{}", "Verbose output enabled".green());
        println!("{} {}", "URL:".blue(), url);
        println!("{} {}", "Query:".blue(), args.query);
        println!("{} {}", "Key:".blue(), args.key);
    }

    let start = Instant::now();

    let response = client
        .get(url)
        .query(&[
            ("cc", "US"),
            ("esl", "en"),
            ("key", &args.key),
            ("locale", "en_US"),
            ("q", &args.query),
        ])
        .header("accept", "*/*")
        .header("accept-language", "en-US,en;q=0.9")
        .header(
            "user-agent",
            "parsecd/1 (Mac15,12; macOS 14.5 23F79) safari/1",
        )
        .header("x-apple-languages", "[\"en-US\"]")
        .send()
        .await?;

    let duration = start.elapsed();

    if args.verbose {
        println!("{} {:?}", "Request duration:".blue(), duration);
        println!("{} {}", "Status:".blue(), response.status());
        println!("{}", "Headers:".blue());
        for (name, value) in response.headers() {
            println!(
                "  {}: {}",
                name.to_string().yellow(),
                value.to_str().unwrap_or("")
            );
        }
    }

    let json: Value = response.json().await?;

    if args.verbose {
        println!("{}", "Full JSON Response:".blue());
        println!("{}", serde_json::to_string_pretty(&json)?);
    }

    if let Some(array) = json.as_array() {
        for item in array {
            if let Some(status) = item["status"].as_str() {
                match status {
                    "NO_RESULTS" => {
                        let query = item["query"].as_str().unwrap_or("Unknown");
                        println!("{} input: '{}' executed: '{}'", "No results found for query:".yellow(), args.query, query);
                        if args.verbose {
                            if let Some(error_mesg) = item["error_mesg"].as_str() {
                                println!("{} {}", "Error message:".red(), error_mesg);
                            }
                        }
                        return Ok(());
                    },
                    "OK" => {
                        if let Some(results) = item["results"].as_array() {
                            for result in results {
                                if let (Some(section_header), Some(completion)) = (
                                    result["section_header"].as_str(),
                                    result["completion"].as_str(),
                                ) {
                                    if section_header == "Siri Suggested Website" {
                                        println!("{} {}", "Siri Suggested Website:".green(), completion);
                                    }
                                }
                            }
                        }
                    },
                    _ => {
                        println!("{} {}", "Unknown status:".red(), status);
                    }
                }
            }
        }
    }

    Ok(())
}
