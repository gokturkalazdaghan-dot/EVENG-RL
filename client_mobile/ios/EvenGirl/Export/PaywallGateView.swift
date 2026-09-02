//
//  PaywallGateView.swift
//  EvenGirl
//
//  Ekran yakalama algılandığında gösterilen OPAK gizlilik kalkanı.
//
//  NEDEN AYRI BİR GÖRÜNÜM
//  Kalkanı ScreenGuard içinde çizmek iki sorun üretir: (1) görünüm React
//  ağacına bağımlı olur ve JS thread'i meşgulken geç çizilir, (2) kayıt
//  başladığı an ile kalkanın belirdiği an arasında videoya giren kareler
//  oluşur. Bu görünüm tamamen UIKit'tir ve ana thread'de anında çizilir.
//
//  OPAK, YARI SAYDAM DEĞİL
//  Blur veya alpha < 1 bir kaplama, ekran kaydında altındaki içeriği
//  okunabilir bırakabilir — özellikle yüksek kontrastlı bir portre altında.
//  Zemin tam opak; bulanıklık yalnızca kalkanın KENDİ dekoratif katmanıdır.
//
//  METİN SUÇLAYICI DEĞİL
//  Kullanıcı bir suçlu değil; ücretsiz hakkını kullanmış bir kişi. Metin ne
//  yapıldığını ve nasıl devam edileceğini söyler, uyarı tonu kullanmaz.
//
import UIKit

@objc(EvenGirlPaywallGateView)
final class PaywallGateView: UIView {

    /// Kullanıcı "Devam et" düğmesine bastığında çağrılır (paywall'a yönlendirme).
    var onContinue: (() -> Void)?

    private let titleLabel = UILabel()
    private let bodyLabel = UILabel()
    private let continueButton = UIButton(type: .system)

    // MARK: - Kurulum

    init(title: String, body: String, actionTitle: String?) {
        super.init(frame: .zero)
        configure(title: title, body: body, actionTitle: actionTitle)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) kullanılmıyor")
    }

    private func configure(title: String, body: String, actionTitle: String?) {
        // TAM OPAK. Sistem rengi değil sabit renk: kullanıcının koyu/açık tema
        // tercihi kalkanın saydamlığını etkilememeli.
        backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.06, alpha: 1.0)
        isOpaque = true
        // Kalkan altındaki içeriğe dokunuş geçirmez.
        isUserInteractionEnabled = true

        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 22, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        bodyLabel.text = body
        bodyLabel.font = .systemFont(ofSize: 15, weight: .regular)
        bodyLabel.textColor = UIColor(white: 0.72, alpha: 1.0)
        bodyLabel.textAlignment = .center
        bodyLabel.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [titleLabel, bodyLabel])
        stack.axis = .vertical
        stack.spacing = 12
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -32)
        ])

        guard let actionTitle else { return }

        continueButton.setTitle(actionTitle, for: .normal)
        continueButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        continueButton.setTitleColor(.white, for: .normal)
        continueButton.backgroundColor = UIColor(red: 0.45, green: 0.35, blue: 0.95, alpha: 1.0)
        continueButton.layer.cornerRadius = 26
        continueButton.translatesAutoresizingMaskIntoConstraints = false
        continueButton.addTarget(self, action: #selector(continueTapped), for: .touchUpInside)
        addSubview(continueButton)

        NSLayoutConstraint.activate([
            continueButton.topAnchor.constraint(equalTo: stack.bottomAnchor, constant: 32),
            continueButton.centerXAnchor.constraint(equalTo: centerXAnchor),
            continueButton.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
            // Dokunma hedefi 52pt: kalkan üstündeki tek çıkış yolu ıskalanmamalı.
            continueButton.heightAnchor.constraint(equalToConstant: 52),
            continueButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 220)
        ])
    }

    @objc
    private func continueTapped() {
        onContinue?()
    }

    /// Metinleri dil değişiminde günceller (kalkan görünürken de).
    @objc
    func updateStrings(title: String, body: String, actionTitle: String?) {
        titleLabel.text = title
        bodyLabel.text = body
        if let actionTitle {
            continueButton.setTitle(actionTitle, for: .normal)
        }
    }
}
