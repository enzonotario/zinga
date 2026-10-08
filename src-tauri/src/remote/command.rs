use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum RemoteCommand {
    Play,
    Pause,
    Next,
    Previous,
    Seek {
        position: u64,
    },
    QueueAdd {
        uris: Vec<String>,
    },
    QueueClear,
    QueuePlayAlbum {
        #[serde(rename = "albumId")]
        album_id: String,
    },
}

impl RemoteCommand {
    pub fn from_ws(action: &str, data: Option<&serde_json::Value>) -> Option<Self> {
        match action {
            "play" => Some(Self::Play),
            "pause" => Some(Self::Pause),
            "next" => Some(Self::Next),
            "prev" | "previous" => Some(Self::Previous),
            "seek" => data
                .and_then(|d| d.get("time_position").or_else(|| d.get("position")))
                .and_then(|p| p.as_f64())
                .map(|p| Self::Seek {
                    position: p.max(0.0).round() as u64,
                }),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_ws_playback_actions() {
        assert_eq!(RemoteCommand::from_ws("play", None), Some(RemoteCommand::Play));
        assert_eq!(RemoteCommand::from_ws("pause", None), Some(RemoteCommand::Pause));
        assert_eq!(RemoteCommand::from_ws("next", None), Some(RemoteCommand::Next));
        assert_eq!(RemoteCommand::from_ws("prev", None), Some(RemoteCommand::Previous));
        assert_eq!(RemoteCommand::from_ws("previous", None), Some(RemoteCommand::Previous));
        assert_eq!(RemoteCommand::from_ws("unknown", None), None);
    }

    #[test]
    fn maps_ws_seek_with_time_position() {
        let data = json!({ "time_position": 61500 });
        assert_eq!(
            RemoteCommand::from_ws("seek", Some(&data)),
            Some(RemoteCommand::Seek { position: 61500 })
        );
        assert_eq!(RemoteCommand::from_ws("seek", None), None);
    }

    #[test]
    fn serializes_with_action_tag() {
        assert_eq!(
            serde_json::to_value(RemoteCommand::Seek { position: 1000 }).unwrap(),
            json!({ "action": "seek", "position": 1000 })
        );
        assert_eq!(
            serde_json::to_value(RemoteCommand::QueuePlayAlbum {
                album_id: "42".to_string()
            })
            .unwrap(),
            json!({ "action": "queue_play_album", "albumId": "42" })
        );
        assert_eq!(
            serde_json::to_value(RemoteCommand::QueueAdd {
                uris: vec!["tidal:track:1".to_string()]
            })
            .unwrap(),
            json!({ "action": "queue_add", "uris": ["tidal:track:1"] })
        );
        assert_eq!(
            serde_json::to_value(RemoteCommand::QueueClear).unwrap(),
            json!({ "action": "queue_clear" })
        );
    }
}
