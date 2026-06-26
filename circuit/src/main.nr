use keccak256::keccak256;

fn main(
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signature: [u8; 64],
    hashed_message: [u8; 32],
    expected_address: pub [u8; 20],
) {
    // Step 1: verify the ECDSA signature is valid
    let valid = std::ecdsa_secp256k1::verify_signature(
        pub_key_x,
        pub_key_y,
        signature,
        hashed_message
    );
    assert(valid, "Invalid ECDSA signature");

    // Step 2: derive Ethereum address = last 20 bytes of keccak256(pub_key_x ++ pub_key_y)
    let mut uncompressed_key: [u8; 64] = [0; 64];
    for i in 0..32 {
        uncompressed_key[i] = pub_key_x[i];
        uncompressed_key[32 + i] = pub_key_y[i];
    }

    let hash: [u8; 32] = keccak256(uncompressed_key, 64);

    let mut derived_address: [u8; 20] = [0; 20];
    for i in 0..20 {
        derived_address[i] = hash[12 + i];
    }

    // Step 3: assert derived address matches expected
    assert(derived_address == expected_address, "Address does not match");
}
